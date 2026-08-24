import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  Role,
  StatusCertificacao,
  StatusCertificado,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { paginar } from '../../common/dto/paginacao.dto';
import { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { CertificadoPdfService } from './certificado-pdf.service';
import {
  AlterarStatusCertificadoDto,
  EmitirCertificadoDto,
  ListarCertificadosDto,
  ListarEmRiscoDto,
} from './dto/certificado.dto';
import {
  diasAteVencer,
  FAIXAS_VENCIMENTO,
  faixaDeVencimento,
  hojeAMeiaNoite,
  VIGENTES,
} from './vencimento.constantes';

const SELECT_CERTIFICADO = {
  id: true,
  numero: true,
  escopo: true,
  dataEmissao: true,
  dataValidade: true,
  status: true,
  motivoStatus: true,
  emitidoPorNome: true,
  arquivoPdf: true,
  criadoEm: true,
  produtoId: true,
  produto: {
    select: {
      id: true,
      nome: true,
      clienteId: true,
      cliente: { select: { id: true, nome: true } },
      categoria: { select: { id: true, nome: true, normaReferencia: true } },
    },
  },
} satisfies Prisma.CertificadoSelect;


@Injectable()
export class CertificadosService {
  private readonly logger = new Logger(CertificadosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly pdf: CertificadoPdfService,
  ) {}

  async listar(filtros: ListarCertificadosDto, usuario: UsuarioAutenticado) {
    // Escopo do cliente vem do token; `clienteId` do filtro é ignorado para ele.
    const clienteId =
      usuario.role === Role.CLIENTE ? usuario.id : filtros.clienteId;

    const where: Prisma.CertificadoWhereInput = {
      ...(filtros.status && { status: filtros.status }),
      ...(filtros.produtoId && { produtoId: filtros.produtoId }),
      ...(clienteId && { produto: { clienteId } }),
      ...(filtros.busca && {
        OR: [
          { numero: { contains: filtros.busca, mode: 'insensitive' } },
          { produto: { nome: { contains: filtros.busca, mode: 'insensitive' } } },
        ],
      }),
    };

    const [dados, total] = await this.prisma.$transaction([
      this.prisma.certificado.findMany({
        where,
        select: SELECT_CERTIFICADO,
        orderBy: { dataEmissao: 'desc' },
        skip: filtros.skip,
        take: filtros.limite,
      }),
      this.prisma.certificado.count({ where }),
    ]);

    return paginar(dados, total, filtros);
  }

  /**
   * Certificados vigentes cuja validade cai dentro da janela pedida.
   *
   * Existe porque o gráfico "Vencimentos à frente" diz QUANTOS vencem em cada
   * faixa, mas não QUAIS — e a listagem comum não filtra por validade nem
   * ordena por ela, então descobrir o que renovar primeiro era trabalho manual.
   *
   * Três decisões que valem registro:
   *
   * - **Ordena por `dataValidade` crescente**, não por emissão. A pergunta aqui
   *   é "o que vence primeiro", e essa é a única ordem que responde.
   * - **Inclui o que já passou da validade.** Com `EXPIRACAO_CRON_ATIVA=false`
   *   (ou entre duas execuções da rotina) existe certificado `EMITIDO` com data
   *   no passado. Ele é o caso mais urgente de todos; filtrar só o futuro o
   *   esconderia justamente de quem precisa agir.
   * - **O resumo é contado sobre o escopo inteiro, não sobre a página.** Um
   *   resumo somado a partir dos 20 itens visíveis diria "4 vencidos" havendo
   *   11, e pareceria correto.
   */
  async listarEmRisco(filtros: ListarEmRiscoDto, usuario: UsuarioAutenticado) {
    const clienteId =
      usuario.role === Role.CLIENTE ? usuario.id : filtros.clienteId;

    const hoje = hojeAMeiaNoite();
    const limite = new Date(hoje);
    limite.setDate(limite.getDate() + filtros.dias);
    // Fim do dia: `dataValidade` é DateTime, e um certificado que vence no
    // último dia da janela às 12h ficaria de fora de um `lte` à meia-noite.
    limite.setHours(23, 59, 59, 999);

    const escopo: Prisma.CertificadoWhereInput = {
      status: { in: VIGENTES },
      ...(clienteId && { produto: { clienteId } }),
    };
    const where: Prisma.CertificadoWhereInput = {
      ...escopo,
      dataValidade: { lte: limite },
    };

    const [dados, total, todosVigentes] = await this.prisma.$transaction([
      this.prisma.certificado.findMany({
        where,
        select: SELECT_CERTIFICADO,
        orderBy: { dataValidade: 'asc' },
        skip: filtros.skip,
        take: filtros.limite,
      }),
      this.prisma.certificado.count({ where }),
      // Só a data: o resumo precisa de todo o escopo, e trazer o registro
      // inteiro para contar faixa seria carregar a carteira à toa.
      this.prisma.certificado.findMany({
        where: escopo,
        select: { dataValidade: true },
      }),
    ]);

    const porFaixa: Record<string, number> = {};
    for (const faixa of FAIXAS_VENCIMENTO) porFaixa[faixa.chave] = 0;
    for (const { dataValidade } of todosVigentes) {
      porFaixa[faixaDeVencimento(diasAteVencer(dataValidade, hoje))] += 1;
    }

    const pagina = paginar(
      dados.map((certificado) => ({
        ...certificado,
        diasRestantes: diasAteVencer(certificado.dataValidade, hoje),
      })),
      total,
      filtros,
    );

    return {
      ...pagina,
      resumo: {
        janelaDias: filtros.dias,
        totalVigentes: todosVigentes.length,
        faixas: FAIXAS_VENCIMENTO.map((f) => ({
          chave: f.chave,
          rotulo: f.rotulo,
          total: porFaixa[f.chave],
        })),
      },
    };
  }

  async buscarPorId(id: number, usuario: UsuarioAutenticado) {
    const certificado = await this.prisma.certificado.findUnique({
      where: { id },
      select: SELECT_CERTIFICADO,
    });

    if (!certificado) {
      throw new NotFoundException(`Certificado ${id} não encontrado.`);
    }
    this.garantirAcesso(certificado.produto.clienteId, usuario);

    return certificado;
  }

  async listarPorProduto(produtoId: number, usuario: UsuarioAutenticado) {
    const produto = await this.prisma.produto.findUnique({
      where: { id: produtoId },
      select: { clienteId: true },
    });

    if (!produto) {
      throw new NotFoundException(`Produto ${produtoId} não encontrado.`);
    }
    this.garantirAcesso(produto.clienteId, usuario);

    return this.prisma.certificado.findMany({
      where: { produtoId },
      select: SELECT_CERTIFICADO,
      orderBy: { dataEmissao: 'desc' },
    });
  }

  /**
   * Emite o certificado de um produto.
   *
   * Exige todas as etapas OBRIGATÓRIAS aprovadas — etapas opcionais pendentes
   * não bloqueiam. A validade vem de `CategoriaProduto.validadeMeses`, salvo
   * data informada explicitamente.
   *
   * O PDF é gerado depois do commit, de propósito: escrita em disco não
   * participa da transação, e o arquivo é derivável do registro. Se falhar, o
   * certificado existe e o PDF é gerado sob demanda no primeiro download.
   */
  async emitir(
    produtoId: number,
    dto: EmitirCertificadoDto,
    usuario: UsuarioAutenticado,
  ) {
    const produto = await this.prisma.produto.findUnique({
      where: { id: produtoId },
      include: {
        cliente: { select: { nome: true, cnpj: true, cpf: true } },
        categoria: true,
        certificacao: {
          select: { status: true, etapa: { select: { nome: true, obrigatoria: true } } },
        },
      },
    });

    if (!produto) {
      throw new NotFoundException(`Produto ${produtoId} não encontrado.`);
    }

    const pendentes = produto.certificacao.filter(
      (certificacao) =>
        certificacao.etapa.obrigatoria &&
        certificacao.status !== StatusCertificacao.APROVADO,
    );

    if (pendentes.length) {
      throw new BadRequestException(
        'Só é possível emitir o certificado com todas as etapas obrigatórias aprovadas. ' +
          `Pendentes: ${pendentes.map((p) => p.etapa.nome).join(', ')}.`,
      );
    }

    const jaVigente = await this.prisma.certificado.findFirst({
      where: { produtoId, status: { in: VIGENTES } },
      select: { numero: true, status: true },
    });

    if (jaVigente) {
      throw new ConflictException(
        `Este produto já possui o certificado ${jaVigente.numero} em vigor. ` +
          'Cancele-o antes de emitir um novo.',
      );
    }

    const dataEmissao = new Date();
    const dataValidade = dto.dataValidade
      ? new Date(dto.dataValidade)
      : this.somarMeses(dataEmissao, produto.categoria.validadeMeses);

    if (dataValidade <= dataEmissao) {
      throw new BadRequestException(
        'A data de validade precisa ser posterior à data de emissão.',
      );
    }

    const certificado = await this.prisma.$transaction(async (tx) => {
      const numero = await this.gerarNumero(tx);

      return tx.certificado.create({
        data: {
          produtoId,
          numero,
          escopo: dto.escopo,
          dataEmissao,
          dataValidade,
          emitidoPorId: usuario.id,
          emitidoPorNome: usuario.nome,
        },
        select: SELECT_CERTIFICADO,
      });
    });

    await this.gerarEGuardarPdf(certificado.id).catch((erro: Error) => {
      // Não derruba a emissão: o PDF é regerado no primeiro download.
      this.logger.error(
        `Falha ao gerar o PDF do certificado ${certificado.numero}: ${erro.message}`,
      );
    });

    return this.buscarPorId(certificado.id, usuario);
  }

  /** Suspensão, cancelamento ou reativação — sempre com justificativa. */
  async alterarStatus(id: number, dto: AlterarStatusCertificadoDto) {
    const certificado = await this.prisma.certificado.findUnique({
      where: { id },
      select: { id: true, status: true, dataValidade: true },
    });

    if (!certificado) {
      throw new NotFoundException(`Certificado ${id} não encontrado.`);
    }

    if (dto.status === StatusCertificado.VENCIDO) {
      throw new BadRequestException(
        'O vencimento decorre da data de validade e não pode ser aplicado manualmente.',
      );
    }

    const encerra =
      dto.status === StatusCertificado.SUSPENSO ||
      dto.status === StatusCertificado.CANCELADO;

    if (encerra && !dto.motivoStatus) {
      throw new BadRequestException(
        'Informe o motivo ao suspender ou cancelar um certificado.',
      );
    }

    if (certificado.status === StatusCertificado.CANCELADO) {
      throw new ConflictException(
        'Certificado cancelado não pode mudar de situação. Emita um novo.',
      );
    }

    if (
      dto.status === StatusCertificado.EMITIDO &&
      certificado.dataValidade <= new Date()
    ) {
      throw new BadRequestException(
        'Este certificado está fora da validade e não pode voltar a vigorar.',
      );
    }

    await this.prisma.certificado.update({
      where: { id },
      data: {
        status: dto.status,
        // Reativação limpa o motivo anterior para não confundir o histórico.
        motivoStatus: encerra ? dto.motivoStatus : null,
      },
    });

    return this.prisma.certificado.findUniqueOrThrow({
      where: { id },
      select: SELECT_CERTIFICADO,
    });
  }

  /** Devolve o PDF, gerando-o se ainda não existir no armazenamento. */
  async obterPdf(
    id: number,
    usuario: UsuarioAutenticado,
  ): Promise<{ nome: string; conteudo: Buffer }> {
    const certificado = await this.buscarPorId(id, usuario);

    if (certificado.arquivoPdf) {
      const conteudo = await this.uploads.ler(certificado.arquivoPdf);
      if (conteudo) {
        return { nome: `${certificado.numero}.pdf`, conteudo };
      }

      // Arquivo sumiu do armazenamento: cai para a regeração abaixo.
      this.logger.warn(
        `PDF ausente para ${certificado.numero}; regerando a partir do registro.`,
      );
    }

    return {
      nome: `${certificado.numero}.pdf`,
      conteudo: await this.gerarEGuardarPdf(id),
    };
  }

  /**
   * Marca como VENCIDO os certificados cuja validade passou.
   *
   * Suspensos também vencem; cancelados não mudam (é estado terminal).
   *
   * Dois acionadores, ambos legítimos: o `ExpiracaoCertificadosCron` chama este
   * método diretamente uma vez por dia, e `POST /certificados/expirar-vencidos`
   * permite disparar na mão ou por um agendador externo. Um único `updateMany`
   * idempotente — o `where` já exclui o que ele acabou de mudar —, então rodar
   * duas vezes seguidas não é problema.
   */
  async expirarVencidos(): Promise<{ mensagem: string; atualizados: number }> {
    const { count } = await this.prisma.certificado.updateMany({
      where: {
        status: { in: VIGENTES },
        dataValidade: { lt: new Date() },
      },
      data: { status: StatusCertificado.VENCIDO },
    });

    const mensagem =
      count === 0
        ? 'Nenhum certificado vencido a atualizar.'
        : `${count} certificado(s) marcado(s) como vencido(s).`;

    // Fica no service, e não no agendador, para que o acionamento manual
    // deixe o mesmo rastro do automático — um OCP precisa saber quando um
    // certificado deixou de valer, e por qual caminho isso foi registrado.
    this.logger.log(mensagem);

    return { mensagem, atualizados: count };
  }

  // ---------------------------------------------------------------- privados

  private async gerarEGuardarPdf(id: number): Promise<Buffer> {
    const certificado = await this.prisma.certificado.findUniqueOrThrow({
      where: { id },
      include: {
        produto: {
          include: {
            cliente: { select: { nome: true, cnpj: true, cpf: true } },
            categoria: { select: { nome: true, normaReferencia: true } },
          },
        },
      },
    });

    const conteudo = await this.pdf.gerar({
      numero: certificado.numero,
      escopo: certificado.escopo,
      dataEmissao: certificado.dataEmissao,
      dataValidade: certificado.dataValidade,
      emitidoPorNome: certificado.emitidoPorNome,
      produto: certificado.produto.nome,
      produtoDescricao: certificado.produto.descricao,
      cliente: certificado.produto.cliente.nome,
      clienteDocumento:
        certificado.produto.cliente.cnpj ?? certificado.produto.cliente.cpf,
      categoria: certificado.produto.categoria.nome,
      normaReferencia: certificado.produto.categoria.normaReferencia,
    });

    const caminhoAntigo = certificado.arquivoPdf;
    const arquivoPdf = await this.uploads.salvarArquivoGerado(
      conteudo,
      'certificados',
      '.pdf',
    );

    await this.prisma.certificado.update({
      where: { id },
      data: { arquivoPdf },
    });
    await this.uploads.remover(caminhoAntigo);

    return conteudo;
  }

  /**
   * Sequencial por ano: PROCERT-2026-000045.
   * Mesma estratégia dos códigos de NC — deriva do maior número do ano, com o
   * índice único servindo de guarda contra emissões simultâneas.
   */
  private async gerarNumero(tx: Prisma.TransactionClient): Promise<string> {
    const ano = new Date().getFullYear();
    const prefixo = `PROCERT-${ano}-`;

    const ultimo = await tx.certificado.findFirst({
      where: { numero: { startsWith: prefixo } },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    });

    const sequencial = ultimo ? Number(ultimo.numero.slice(prefixo.length)) + 1 : 1;
    return `${prefixo}${String(sequencial).padStart(6, '0')}`;
  }

  /**
   * Soma meses preservando o fim de mês: 31/01 + 1 mês vira 28/02, não 03/03
   * como faria o `setMonth` puro do JavaScript.
   */
  private somarMeses(data: Date, meses: number): Date {
    const resultado = new Date(data);
    const diaOriginal = resultado.getDate();

    resultado.setMonth(resultado.getMonth() + meses);

    if (resultado.getDate() !== diaOriginal) {
      resultado.setDate(0);
    }
    return resultado;
  }

  private garantirAcesso(clienteId: number, usuario: UsuarioAutenticado): void {
    if (usuario.role === Role.CLIENTE && usuario.id !== clienteId) {
      throw new ForbiddenException(
        'Você só pode acessar os certificados dos seus produtos.',
      );
    }
  }
}
