import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  Role,
  StatusCertificacao,
  StatusNaoConformidade,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { paginar } from '../../common/dto/paginacao.dto';
import { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import {
  AbrirNaoConformidadeDto,
  AvaliarNaoConformidadeDto,
  ListarNaoConformidadesDto,
  ResponderNaoConformidadeDto,
} from './dto/nao-conformidade.dto';

const SELECT_NC = {
  id: true,
  codigo: true,
  descricao: true,
  criticidade: true,
  status: true,
  prazoResposta: true,
  respostaCliente: true,
  respondidoEm: true,
  parecer: true,
  abertoPorNome: true,
  resolvidoEm: true,
  criadoEm: true,
  certificacaoId: true,
  certificacao: {
    select: {
      id: true,
      status: true,
      ordem: true,
      etapa: { select: { id: true, nome: true } },
      produto: {
        select: {
          id: true,
          nome: true,
          clienteId: true,
          cliente: { select: { id: true, nome: true } },
        },
      },
    },
  },
} satisfies Prisma.NaoConformidadeSelect;

/** Situações em que a NC ainda espera alguma ação. */
const EM_ABERTO: StatusNaoConformidade[] = [
  StatusNaoConformidade.ABERTA,
  StatusNaoConformidade.EM_TRATATIVA,
];

@Injectable()
export class NaoConformidadesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista com escopo por papel: o cliente vê apenas as NCs dos seus produtos.
   * A ordenação prioriza o que vence antes — prazo nulo vai para o fim.
   */
  async listar(filtros: ListarNaoConformidadesDto, usuario: UsuarioAutenticado) {
    const where: Prisma.NaoConformidadeWhereInput = {
      ...(filtros.status && { status: filtros.status }),
      ...(filtros.criticidade && { criticidade: filtros.criticidade }),
      ...(filtros.pendentes && { status: { in: EM_ABERTO } }),
      certificacao: {
        produto: {
          ...(filtros.produtoId && { id: filtros.produtoId }),
          // Escopo vindo do token, nunca de parâmetro de URL.
          ...(usuario.role === Role.CLIENTE && { clienteId: usuario.id }),
        },
      },
      ...(filtros.busca && {
        OR: [
          { codigo: { contains: filtros.busca, mode: 'insensitive' } },
          { descricao: { contains: filtros.busca, mode: 'insensitive' } },
        ],
      }),
    };

    const [dados, total] = await this.prisma.$transaction([
      this.prisma.naoConformidade.findMany({
        where,
        select: SELECT_NC,
        orderBy: [{ prazoResposta: { sort: 'asc', nulls: 'last' } }, { id: 'desc' }],
        skip: filtros.skip,
        take: filtros.limite,
      }),
      this.prisma.naoConformidade.count({ where }),
    ]);

    return paginar(dados, total, filtros);
  }

  async buscarPorId(id: number, usuario: UsuarioAutenticado) {
    const registro = await this.prisma.naoConformidade.findUnique({
      where: { id },
      select: SELECT_NC,
    });

    if (!registro) {
      throw new NotFoundException(`Não conformidade ${id} não encontrada.`);
    }
    this.garantirAcesso(registro.certificacao.produto.clienteId, usuario);

    return registro;
  }

  /** Abre uma NC em uma etapa reprovada. */
  async abrir(
    certificacaoId: number,
    dto: AbrirNaoConformidadeDto,
    usuario: UsuarioAutenticado,
  ) {
    const certificacao = await this.prisma.certificacaoProduto.findUnique({
      where: { id: certificacaoId },
      select: { id: true, status: true },
    });

    if (!certificacao) {
      throw new NotFoundException(
        `Etapa de certificação ${certificacaoId} não encontrada.`,
      );
    }

    if (certificacao.status !== StatusCertificacao.REPROVADO) {
      throw new BadRequestException(
        'Só é possível registrar não conformidade em uma etapa reprovada.',
      );
    }

    const criada = await this.criarRegistro(certificacaoId, dto, usuario);
    return this.prisma.naoConformidade.findUniqueOrThrow({
      where: { id: criada.id },
      select: SELECT_NC,
    });
  }

  /**
   * Cria a NC dentro de uma transação em andamento.
   *
   * Exposto para `CertificacoesService.salvar()` abrir a NC no mesmo commit da
   * reprovação da etapa: ou as duas coisas acontecem, ou nenhuma.
   */
  async criarRegistro(
    certificacaoId: number,
    dto: AbrirNaoConformidadeDto,
    usuario: UsuarioAutenticado,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const codigo = await this.gerarCodigo(tx);

    return tx.naoConformidade.create({
      data: {
        certificacaoId,
        codigo,
        descricao: dto.descricao,
        criticidade: dto.criticidade,
        prazoResposta: dto.prazoResposta ? new Date(dto.prazoResposta) : null,
        // Autoria vem da sessão, nunca de campo editável pelo usuário.
        abertoPorId: usuario.role === Role.CLIENTE ? null : usuario.id,
        abertoPorNome: usuario.nome,
      },
    });
  }

  /** Resposta do cliente — só nas NCs dos próprios produtos e ainda em aberto. */
  async responder(
    id: number,
    dto: ResponderNaoConformidadeDto,
    usuario: UsuarioAutenticado,
  ) {
    const registro = await this.buscarPorId(id, usuario);

    if (!EM_ABERTO.includes(registro.status)) {
      throw new BadRequestException(
        'Esta não conformidade já foi avaliada e não aceita nova resposta.',
      );
    }

    await this.prisma.naoConformidade.update({
      where: { id },
      data: {
        respostaCliente: dto.respostaCliente,
        respondidoEm: new Date(),
        // A resposta move a NC para tratativa; a decisão continua com a equipe.
        status: StatusNaoConformidade.EM_TRATATIVA,
      },
    });

    return this.buscarPorId(id, usuario);
  }

  /**
   * Avaliação da equipe.
   *
   * `RESOLVIDA` devolve a etapa para `EM_ANDAMENTO` — ela precisa ser
   * reavaliada, não é aprovada automaticamente —, e a transição fica no
   * histórico com a autoria de quem decidiu.
   */
  async avaliar(
    id: number,
    dto: AvaliarNaoConformidadeDto,
    usuario: UsuarioAutenticado,
  ) {
    const registro = await this.prisma.naoConformidade.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        codigo: true,
        certificacao: { select: { id: true, status: true } },
      },
    });

    if (!registro) {
      throw new NotFoundException(`Não conformidade ${id} não encontrada.`);
    }

    if (dto.status === StatusNaoConformidade.ABERTA) {
      throw new BadRequestException(
        'Não é possível reabrir uma não conformidade; registre uma nova.',
      );
    }

    if (!EM_ABERTO.includes(registro.status)) {
      throw new BadRequestException(
        'Esta não conformidade já foi encerrada e não pode ser reavaliada.',
      );
    }

    const resolvida = dto.status === StatusNaoConformidade.RESOLVIDA;

    await this.prisma.$transaction(async (tx) => {
      await tx.naoConformidade.update({
        where: { id },
        data: {
          status: dto.status,
          parecer: dto.parecer,
          resolvidoEm: dto.status === StatusNaoConformidade.EM_TRATATIVA ? null : new Date(),
        },
      });

      if (!resolvida) return;

      await tx.certificacaoProduto.update({
        where: { id: registro.certificacao.id },
        data: { status: StatusCertificacao.EM_ANDAMENTO },
      });

      await tx.certificacaoHistorico.create({
        data: {
          certificacaoId: registro.certificacao.id,
          statusAnterior: registro.certificacao.status,
          statusNovo: StatusCertificacao.EM_ANDAMENTO,
          observacao: `Não conformidade ${registro.codigo} resolvida — etapa reaberta para reavaliação.`,
          alteradoPorId: usuario.id,
          alteradoPorNome: usuario.nome,
        },
      });
    });

    return this.buscarPorId(id, usuario);
  }

  // ---------------------------------------------------------------- privados

  /**
   * Sequencial por ano: NC-2026-000001.
   *
   * Deriva do maior código do ano em vez de contar linhas — exclusões
   * deixariam a contagem reutilizar um número já emitido. Corridas entre duas
   * aberturas simultâneas esbarram no índice único de `codigo`, e o
   * `AllExceptionsFilter` traduz para 409.
   */
  private async gerarCodigo(tx: Prisma.TransactionClient): Promise<string> {
    const ano = new Date().getFullYear();
    const prefixo = `NC-${ano}-`;

    const ultima = await tx.naoConformidade.findFirst({
      where: { codigo: { startsWith: prefixo } },
      orderBy: { codigo: 'desc' },
      select: { codigo: true },
    });

    const sequencial = ultima ? Number(ultima.codigo.slice(prefixo.length)) + 1 : 1;
    return `${prefixo}${String(sequencial).padStart(6, '0')}`;
  }

  private garantirAcesso(clienteId: number, usuario: UsuarioAutenticado): void {
    if (usuario.role === Role.CLIENTE && usuario.id !== clienteId) {
      throw new ForbiddenException(
        'Você só pode acessar as não conformidades dos seus produtos.',
      );
    }
  }
}
