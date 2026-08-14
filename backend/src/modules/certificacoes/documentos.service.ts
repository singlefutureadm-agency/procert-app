import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { readFile } from 'node:fs/promises';

import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';

const SELECT_DOCUMENTO = {
  id: true,
  nomeArquivo: true,
  arquivoUrl: true,
  tipoMime: true,
  tamanhoBytes: true,
  enviadoPorNome: true,
  criadoEm: true,
} satisfies Prisma.DocumentoCertificacaoSelect;

/**
 * Evidências anexadas às etapas da certificação.
 *
 * Vive no módulo de certificações porque um documento nunca existe sozinho:
 * ele é sempre a prova de algo que aconteceu na trilha de um produto.
 */
@Injectable()
export class DocumentosCertificacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  /**
   * Anexa um documento a uma etapa.
   *
   * Cria um registro de histórico para o anexo e pendura o arquivo nele: assim
   * todo documento carrega momento e autoria, mesmo quando enviado sem que o
   * status da etapa mude. O status anterior e o novo são iguais nesse registro
   * — é uma marcação de trilha, não uma transição.
   */
  async anexar(
    produtoId: number,
    certificacaoId: number,
    arquivo: Express.Multer.File,
    usuario: UsuarioAutenticado,
  ) {
    const certificacao = await this.prisma.certificacaoProduto.findUnique({
      where: { id: certificacaoId },
      select: {
        id: true,
        produtoId: true,
        status: true,
        etapa: { select: { nome: true } },
      },
    });

    if (!certificacao || certificacao.produtoId !== produtoId) {
      throw new NotFoundException(
        `Etapa ${certificacaoId} não encontrada no produto ${produtoId}.`,
      );
    }

    const arquivoUrl = await this.uploads.salvarDocumento(arquivo, 'certificacoes');

    // Nome original vem do cliente: guardado só para exibição, nunca usado
    // para montar caminho em disco (o arquivo real é um UUID).
    const nomeArquivo = arquivo.originalname.slice(0, 255);

    const documento = await this.prisma.$transaction(async (tx) => {
      const historico = await tx.certificacaoHistorico.create({
        data: {
          certificacaoId,
          statusAnterior: certificacao.status,
          statusNovo: certificacao.status,
          observacao: `Documento anexado: ${nomeArquivo}`,
          alteradoPorId: usuario.role === Role.CLIENTE ? null : usuario.id,
          alteradoPorNome: usuario.nome,
        },
      });

      return tx.documentoCertificacao.create({
        data: {
          historicoId: historico.id,
          nomeArquivo,
          arquivoUrl,
          tipoMime: arquivo.mimetype,
          tamanhoBytes: arquivo.size,
          enviadoPorId: usuario.role === Role.CLIENTE ? null : usuario.id,
          enviadoPorNome: usuario.nome,
        },
        select: SELECT_DOCUMENTO,
      });
    });

    return documento;
  }

  /** Conteúdo do arquivo, com verificação de posse para o CLIENTE. */
  async baixar(
    id: number,
    usuario: UsuarioAutenticado,
  ): Promise<{ nome: string; tipo: string; conteudo: Buffer }> {
    const documento = await this.prisma.documentoCertificacao.findUnique({
      where: { id },
      select: {
        nomeArquivo: true,
        arquivoUrl: true,
        tipoMime: true,
        historico: {
          select: {
            certificacao: { select: { produto: { select: { clienteId: true } } } },
          },
        },
      },
    });

    if (!documento) {
      throw new NotFoundException(`Documento ${id} não encontrado.`);
    }

    const clienteId = documento.historico.certificacao.produto.clienteId;
    if (usuario.role === Role.CLIENTE && usuario.id !== clienteId) {
      throw new ForbiddenException(
        'Você só pode acessar documentos dos seus produtos.',
      );
    }

    const caminho = this.uploads.caminhoAbsoluto(documento.arquivoUrl);
    if (!caminho) {
      throw new NotFoundException('Arquivo indisponível.');
    }

    try {
      return {
        nome: documento.nomeArquivo,
        tipo: documento.tipoMime,
        conteudo: await readFile(caminho),
      };
    } catch {
      throw new NotFoundException(
        'O arquivo deste documento não está mais disponível no servidor.',
      );
    }
  }

  /**
   * Etapas que exigem documento e ainda não têm nenhum.
   * Usado antes de aceitar a aprovação de um lote.
   */
  async etapasSemDocumento(certificacaoIds: number[]): Promise<string[]> {
    if (certificacaoIds.length === 0) return [];

    const etapas = await this.prisma.certificacaoProduto.findMany({
      where: { id: { in: certificacaoIds }, etapa: { exigeDocumento: true } },
      select: {
        etapa: { select: { nome: true } },
        historico: { select: { _count: { select: { documentos: true } } } },
      },
    });

    return etapas
      .filter((certificacao) =>
        certificacao.historico.every((registro) => registro._count.documentos === 0),
      )
      .map((certificacao) => certificacao.etapa.nome);
  }
}
