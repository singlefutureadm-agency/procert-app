import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, SituacaoDocumento } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { garantirProcessoAberto } from './certificacoes.service';
import { AvaliarDocumentoDto } from './dto/certificacao.dto';

const SELECT_DOCUMENTO = {
  id: true,
  microEtapaId: true,
  nomeArquivo: true,
  arquivoUrl: true,
  tipoMime: true,
  tamanhoBytes: true,
  enviadoPorNome: true,
  enviadoPorCliente: true,
  situacao: true,
  parecer: true,
  avaliadoPorNome: true,
  avaliadoEm: true,
  criadoEm: true,
} satisfies Prisma.DocumentoCertificacaoSelect;

/**
 * Evidências e documentos pedidos nas etapas da certificação.
 *
 * Vive no módulo de certificações porque um documento nunca existe sozinho:
 * ele é sempre a prova de algo que aconteceu na trilha de um processo.
 *
 * ## Dois tipos de documento, e a diferença está em `microEtapaId`
 *
 * |  | Evidência da ETAPA | Documento PEDIDO na microetapa |
 * |---|---|---|
 * | `microEtapaId` | `null` | o item do checklist |
 * | Quem envia | a equipe | o CLIENTE, pelo painel dele |
 * | `situacao` | `null` — não passa por aceite | PENDENTE, depois ACEITO ou RECUSADO |
 * | Para que serve | `ModeloEtapa.exigeDocumento` | concluir o item do checklist |
 *
 * **`situacao: null` não é "pendente".** É "não se julga este arquivo" — a
 * equipe o anexou, e era o caso de toda linha anterior a 17/11/2026. Tratar os
 * dois como o mesmo estado inventaria uma fila de avaliação que nunca existiu,
 * e ela apareceria na tela como trabalho a fazer.
 */
@Injectable()
export class DocumentosCertificacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  /**
   * Anexa um documento a uma etapa — e, opcionalmente, ao item do checklist que
   * ele responde.
   *
   * Cria um registro de histórico para o anexo e pendura o arquivo nele: assim
   * todo documento carrega momento e autoria, mesmo quando enviado sem que o
   * status da etapa mude. O status anterior e o novo são iguais nesse registro
   * — é uma marcação de trilha, não uma transição.
   *
   * **O CLIENTE pode enviar**, e é por isso que esta rota passou a existir para
   * ele: um item de checklist com `exigeDocumento` é um pedido, e pedido que só
   * a equipe consegue atender não é pedido. O escopo é imposto aqui, no
   * service, pelo `clienteId` do PROCESSO — nunca por id vindo da URL.
   */
  async anexar(
    processoId: number,
    certificacaoId: number,
    arquivo: Express.Multer.File,
    usuario: UsuarioAutenticado,
    microEtapaId?: number,
  ) {
    const certificacao = await this.prisma.certificacaoProcesso.findUnique({
      where: { id: certificacaoId },
      select: {
        id: true,
        processoId: true,
        status: true,
        etapa: { select: { nome: true } },
        processo: {
          select: { clienteId: true, canceladoEm: true, status: true },
        },
      },
    });

    if (!certificacao || certificacao.processoId !== processoId) {
      throw new NotFoundException(
        `Etapa ${certificacaoId} não encontrada no processo ${processoId}.`,
      );
    }

    const doCliente = usuario.role === Role.CLIENTE;
    if (doCliente && usuario.id !== certificacao.processo.clienteId) {
      throw new ForbiddenException(
        'Você só pode enviar documentos para os seus próprios processos.',
      );
    }

    // Processo cancelado ou inativo não aceita escrita na trilha — mesma guarda
    // do lote, do checklist e de mover fase.
    garantirProcessoAberto(certificacao.processo);

    const micro = microEtapaId
      ? await this.garantirMicroEtapaDaEtapa(microEtapaId, certificacao.id)
      : null;

    // O cliente só envia CONTRA UM PEDIDO. Sem esta guarda ele poderia anexar
    // arquivo solto em qualquer etapa, e a equipe passaria a ter uma caixa de
    // entrada que ninguém pediu e nada obriga a olhar.
    if (doCliente) {
      if (!micro) {
        throw new BadRequestException(
          'Informe o item do checklist a que este documento responde. Você ' +
            'pode enviar documentos apenas para os itens que a equipe solicitou.',
        );
      }
      if (!micro.exigeDocumento) {
        throw new BadRequestException(
          `O item "${micro.nome}" não solicita documento.`,
        );
      }
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
          observacao: micro
            ? `Documento enviado para "${micro.nome}": ${nomeArquivo}`
            : `Documento anexado: ${nomeArquivo}`,
          alteradoPorId: doCliente ? null : usuario.id,
          alteradoPorNome: usuario.nome,
        },
      });

      return tx.documentoCertificacao.create({
        data: {
          historicoId: historico.id,
          microEtapaId: micro?.id,
          nomeArquivo,
          arquivoUrl,
          tipoMime: arquivo.mimetype,
          tamanhoBytes: arquivo.size,
          enviadoPorId: doCliente ? null : usuario.id,
          enviadoPorNome: usuario.nome,
          enviadoPorCliente: doCliente,
          // Só documento de item de checklist entra na fila de avaliação.
          // Evidência da etapa segue com `situacao` nula — ver o quadro no
          // topo da classe.
          situacao: micro ? SituacaoDocumento.PENDENTE : undefined,
        },
        select: SELECT_DOCUMENTO,
      });
    });

    return documento;
  }

  /**
   * Aceita ou recusa um documento enviado para um item do checklist.
   *
   * Guardas, e nenhuma é decorativa:
   *
   * - **só documento que passa por aceite** (`situacao` não nula). Julgar uma
   *   evidência que a própria equipe anexou não tem sentido, e a invariante do
   *   banco recusaria a linha.
   * - **recusa exige parecer.** Documento devolvido sem motivo é um reenvio às
   *   cegas. O DTO dá a mensagem boa; `ck_documento_avaliacao` é a garantia.
   * - **item já concluído trava a RECUSA** (409). Recusar depois de o item ter
   *   sido marcado deixaria a conclusão apoiada num documento que a equipe
   *   acabou de negar — mesmo raciocínio do certificado em vigor travando a
   *   reabertura da etapa. Desmarcar primeiro é explícito; desmarcar aqui, em
   *   silêncio, apagaria trabalho de outra pessoa.
   *
   * **Aceitar NÃO conclui o item.** A conclusão continua sendo o ato de marcar,
   * como manda a regra da aprovação automática: derivada do documento, uma
   * microetapa se concluiria sozinha e levaria a etapa com ela.
   */
  async avaliar(
    id: number,
    dto: AvaliarDocumentoDto,
    usuario: UsuarioAutenticado,
  ) {
    const documento = await this.prisma.documentoCertificacao.findUnique({
      where: { id },
      select: {
        id: true,
        nomeArquivo: true,
        situacao: true,
        microEtapa: { select: { id: true, nome: true, concluida: true } },
        historico: {
          select: {
            certificacaoId: true,
            certificacao: {
              select: {
                status: true,
                processo: { select: { canceladoEm: true, status: true } },
              },
            },
          },
        },
      },
    });

    if (!documento) {
      throw new NotFoundException(`Documento ${id} não encontrado.`);
    }

    if (documento.situacao === null) {
      throw new BadRequestException(
        'Este documento é uma evidência anexada pela equipe e não passa por ' +
          'aceite. Só os enviados para um item do checklist são avaliados.',
      );
    }

    garantirProcessoAberto(documento.historico.certificacao.processo);

    const recusando = dto.situacao === SituacaoDocumento.RECUSADO;

    if (recusando && documento.microEtapa?.concluida) {
      throw new ConflictException(
        `O item "${documento.microEtapa.nome}" já está concluído com este ` +
          'documento. Desmarque o item no checklist antes de recusar o arquivo.',
      );
    }

    const certificacaoId = documento.historico.certificacaoId;
    const statusEtapa = documento.historico.certificacao.status;

    return this.prisma.$transaction(async (tx) => {
      const atualizado = await tx.documentoCertificacao.update({
        where: { id },
        data: {
          situacao: dto.situacao,
          // Aceitar limpa o parecer de uma recusa anterior: um motivo de
          // devolução ao lado de um "aceito" afirmaria duas coisas opostas
          // sobre o mesmo arquivo.
          parecer: recusando ? dto.parecer : null,
          avaliadoPorId: usuario.id,
          avaliadoPorNome: usuario.nome,
          avaliadoEm: new Date(),
        },
        select: SELECT_DOCUMENTO,
      });

      // Marcação de trilha, no mesmo commit: a decisão sobre o documento é
      // parte do que aconteceu na etapa, e sem ela o histórico mostraria o
      // envio e nunca o desfecho.
      await tx.certificacaoHistorico.create({
        data: {
          certificacaoId,
          statusAnterior: statusEtapa,
          statusNovo: statusEtapa,
          observacao: recusando
            ? `Documento recusado: ${documento.nomeArquivo} — ${dto.parecer}`
            : `Documento aceito: ${documento.nomeArquivo}`,
          alteradoPorId: usuario.id,
          alteradoPorNome: usuario.nome,
        },
      });

      return atualizado;
    });
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
            certificacao: { select: { processo: { select: { clienteId: true } } } },
          },
        },
      },
    });

    if (!documento) {
      throw new NotFoundException(`Documento ${id} não encontrado.`);
    }

    const clienteId = documento.historico.certificacao.processo.clienteId;
    if (usuario.role === Role.CLIENTE && usuario.id !== clienteId) {
      throw new ForbiddenException(
        'Você só pode acessar documentos dos seus processos.',
      );
    }

    const conteudo = await this.uploads.ler(documento.arquivoUrl);
    if (!conteudo) {
      throw new NotFoundException(
        'O arquivo deste documento não está mais disponível no servidor.',
      );
    }

    return {
      nome: documento.nomeArquivo,
      tipo: documento.tipoMime,
      conteudo,
    };
  }

  /**
   * Etapas que exigem documento e ainda não têm nenhum.
   * Usado antes de aceitar a aprovação de um lote.
   */
  async etapasSemDocumento(certificacaoIds: number[]): Promise<string[]> {
    if (certificacaoIds.length === 0) return [];

    const etapas = await this.prisma.certificacaoProcesso.findMany({
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

  /**
   * O item do checklist tem um documento ACEITO?
   *
   * `ACEITO`, e não "tem documento": um `PENDENTE` ainda não foi olhado e um
   * `RECUSADO` foi olhado e negado. Contar qualquer um dos dois deixaria o item
   * se concluir sobre documento que a equipe não aprovou — exatamente o que o
   * pedido existe para impedir.
   */
  async temDocumentoAceito(microEtapaId: number): Promise<boolean> {
    const aceitos = await this.prisma.documentoCertificacao.count({
      where: { microEtapaId, situacao: SituacaoDocumento.ACEITO },
    });
    return aceitos > 0;
  }

  // ---------------------------------------------------------------- privados

  /**
   * A microetapa existe E pertence a esta etapa.
   *
   * A segunda metade não é formalidade: sem ela um id de microetapa de OUTRO
   * processo seria aceito, e o documento apareceria no checklist de um cliente
   * que não o enviou.
   */
  private async garantirMicroEtapaDaEtapa(
    microEtapaId: number,
    certificacaoId: number,
  ) {
    const micro = await this.prisma.microEtapaCertificacao.findUnique({
      where: { id: microEtapaId },
      select: {
        id: true,
        nome: true,
        exigeDocumento: true,
        certificacaoId: true,
      },
    });

    if (!micro || micro.certificacaoId !== certificacaoId) {
      throw new NotFoundException(
        `Item ${microEtapaId} não encontrado no checklist desta etapa.`,
      );
    }

    return micro;
  }
}
