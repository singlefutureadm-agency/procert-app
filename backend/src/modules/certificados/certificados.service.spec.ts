import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { StatusCertificacao, StatusCertificado } from '@prisma/client';
import { mockDeep } from 'jest-mock-extended';

import { CertificadosService } from './certificados.service';
import { CertificadoPdfService } from './certificado-pdf.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { criarPrismaMock, PrismaMock } from '../../testing/prisma.mock';
import { admin, cliente, funcionario } from '../../testing/usuarios.fixture';
import { ListarCertificadosDto } from './dto/certificado.dto';

const CLIENTE_DONO = 100;
const CLIENTE_ALHEIO = 200;

/** Etapa da trilha do produto, como o `include` do serviço a enxerga. */
const etapa = (
  nome: string,
  obrigatoria: boolean,
  status: StatusCertificacao,
) => ({ status, etapa: { nome, obrigatoria } });

const produtoBase = (
  certificacao: ReturnType<typeof etapa>[],
  validadeMeses = 12,
) => ({
  id: 1,
  nome: 'Disjuntor DIN 25A',
  descricao: 'Linha residencial',
  clienteId: CLIENTE_DONO,
  cliente: { nome: 'Indústria Cliente Ltda', cnpj: '12345678000199', cpf: null },
  categoria: {
    id: 3,
    nome: 'Material elétrico',
    normaReferencia: 'NBR 5361',
    validadeMeses,
  },
  certificacao,
});

const certificadoSalvo = (extra: Record<string, unknown> = {}) => ({
  id: 55,
  numero: 'PROCERT-2026-000001',
  escopo: 'Disjuntores termomagnéticos',
  dataEmissao: new Date(2026, 0, 31),
  dataValidade: new Date(2027, 0, 31),
  status: StatusCertificado.EMITIDO,
  motivoStatus: null,
  emitidoPorNome: 'Ana Administradora',
  arquivoPdf: null,
  criadoEm: new Date(2026, 0, 31),
  produtoId: 1,
  produto: {
    id: 1,
    nome: 'Disjuntor DIN 25A',
    clienteId: CLIENTE_DONO,
    cliente: { id: CLIENTE_DONO, nome: 'Indústria Cliente Ltda' },
    categoria: { id: 3, nome: 'Material elétrico', normaReferencia: 'NBR 5361' },
  },
  ...extra,
});

describe('CertificadosService', () => {
  let servico: CertificadosService;
  let banco: PrismaMock;
  let uploads: jest.Mocked<UploadsService>;
  let pdf: jest.Mocked<CertificadoPdfService>;

  beforeEach(() => {
    jest.clearAllMocks();

    banco = criarPrismaMock();
    uploads = mockDeep<UploadsService>();
    pdf = mockDeep<CertificadoPdfService>();

    servico = new CertificadosService(
      banco.prisma as unknown as PrismaService,
      uploads,
      pdf,
    );

    // `expirarVencidos` registra o resultado em nível `log`; sem silenciar, a
    // saída da suíte fica poluída pelo Logger do Nest.
    jest.spyOn(servico['logger'], 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Prepara os mocks do caminho feliz de `emitir`, exceto o produto. */
  function prepararEmissao() {
    banco.prisma.certificado.findFirst.mockResolvedValue(null as never);
    banco.tx.certificado.findFirst.mockResolvedValue(null as never);
    banco.tx.certificado.create.mockResolvedValue(certificadoSalvo() as never);
    banco.prisma.certificado.findUnique.mockResolvedValue(
      certificadoSalvo() as never,
    );
    // O PDF é gerado depois do commit; aqui ele fica fora do caminho medido.
    banco.prisma.certificado.findUniqueOrThrow.mockRejectedValue(
      new Error('PDF não exercitado neste teste'),
    );
    jest.spyOn(servico['logger'], 'error').mockImplementation(() => undefined);
  }

  describe('emitir — regra das etapas obrigatórias', () => {
    it('bloqueia com etapa OBRIGATÓRIA pendente e nomeia as pendentes na mensagem', async () => {
      banco.prisma.produto.findUnique.mockResolvedValue(
        produtoBase([
          etapa('Análise documental', true, StatusCertificacao.APROVADO),
          etapa('Ensaios laboratoriais', true, StatusCertificacao.EM_ANDAMENTO),
          etapa('Auditoria de fábrica', true, StatusCertificacao.PENDENTE),
        ]) as never,
      );

      // A mensagem faz parte do contrato com o usuário: é o texto da tela.
      await expect(
        servico.emitir(1, { escopo: 'Disjuntores' }, admin()),
      ).rejects.toThrow(
        new BadRequestException(
          'Só é possível emitir o certificado com todas as etapas obrigatórias aprovadas. ' +
            'Pendentes: Ensaios laboratoriais, Auditoria de fábrica.',
        ),
      );
      expect(banco.transacoesAbertas).toBe(0);
    });

    it('PERMITE emitir com etapa OPCIONAL pendente', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 31, 12));
      banco.prisma.produto.findUnique.mockResolvedValue(
        produtoBase([
          etapa('Análise documental', true, StatusCertificacao.APROVADO),
          etapa('Ensaios laboratoriais', true, StatusCertificacao.APROVADO),
          etapa('Selo verde (opcional)', false, StatusCertificacao.PENDENTE),
        ]) as never,
      );
      prepararEmissao();

      await expect(
        servico.emitir(1, { escopo: 'Disjuntores' }, admin()),
      ).resolves.toBeDefined();
      expect(banco.tx.certificado.create).toHaveBeenCalled();
    });

    it('recusa produto inexistente', async () => {
      banco.prisma.produto.findUnique.mockResolvedValue(null as never);

      await expect(
        servico.emitir(999, { escopo: 'x' }, admin()),
      ).rejects.toThrow(new NotFoundException('Produto 999 não encontrado.'));
    });
  });

  describe('emitir — certificado vigente ocupa o lugar', () => {
    it.each([[StatusCertificado.EMITIDO], [StatusCertificado.SUSPENSO]])(
      'devolve 409 quando já existe certificado %s',
      async (status) => {
        banco.prisma.produto.findUnique.mockResolvedValue(
          produtoBase([
            etapa('Análise documental', true, StatusCertificacao.APROVADO),
          ]) as never,
        );
        banco.prisma.certificado.findFirst.mockResolvedValue({
          numero: 'PROCERT-2026-000001',
          status,
        } as never);

        await expect(
          servico.emitir(1, { escopo: 'Disjuntores' }, admin()),
        ).rejects.toThrow(
          new ConflictException(
            'Este produto já possui o certificado PROCERT-2026-000001 em vigor. ' +
              'Cancele-o antes de emitir um novo.',
          ),
        );
        expect(banco.transacoesAbertas).toBe(0);
      },
    );

    it('consulta o vigente apenas entre EMITIDO e SUSPENSO — vencido e cancelado liberam o lugar', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 31, 12));
      banco.prisma.produto.findUnique.mockResolvedValue(
        produtoBase([
          etapa('Análise documental', true, StatusCertificacao.APROVADO),
        ]) as never,
      );
      prepararEmissao();

      await servico.emitir(1, { escopo: 'Disjuntores' }, admin());

      expect(banco.prisma.certificado.findFirst).toHaveBeenCalledWith({
        where: {
          produtoId: 1,
          status: {
            in: [StatusCertificado.EMITIDO, StatusCertificado.SUSPENSO],
          },
        },
        select: { numero: true, status: true },
      });
    });
  });

  describe('emitir — cálculo da validade', () => {
    beforeEach(() => {
      prepararEmissao();
    });

    /** Lê a `dataValidade` que foi efetivamente gravada. */
    function validadeGravada(): Date {
      const [{ data }] = banco.tx.certificado.create.mock.calls[0];
      return data.dataValidade as Date;
    }

    it('31/01 + 1 mês vira 28/02, não 03/03 (fim de mês preservado)', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 31, 12));
      banco.prisma.produto.findUnique.mockResolvedValue(
        produtoBase(
          [etapa('Análise documental', true, StatusCertificacao.APROVADO)],
          1,
        ) as never,
      );

      await servico.emitir(1, { escopo: 'Disjuntores' }, admin());

      const validade = validadeGravada();
      // `setMonth` puro daria 03/03/2026: fevereiro de 2026 tem 28 dias.
      expect(validade.getFullYear()).toBe(2026);
      expect(validade.getMonth()).toBe(1); // fevereiro
      expect(validade.getDate()).toBe(28);
    });

    it('31/01/2024 + 1 mês vira 29/02 em ano bissexto', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2024, 0, 31, 12));
      banco.prisma.produto.findUnique.mockResolvedValue(
        produtoBase(
          [etapa('Análise documental', true, StatusCertificacao.APROVADO)],
          1,
        ) as never,
      );

      await servico.emitir(1, { escopo: 'Disjuntores' }, admin());

      const validade = validadeGravada();
      expect(validade.getMonth()).toBe(1);
      expect(validade.getDate()).toBe(29);
    });

    it('31/01 + 12 meses volta a 31/01 do ano seguinte', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 31, 12));
      banco.prisma.produto.findUnique.mockResolvedValue(
        produtoBase(
          [etapa('Análise documental', true, StatusCertificacao.APROVADO)],
          12,
        ) as never,
      );

      await servico.emitir(1, { escopo: 'Disjuntores' }, admin());

      const validade = validadeGravada();
      expect(validade.getFullYear()).toBe(2027);
      expect(validade.getMonth()).toBe(0);
      expect(validade.getDate()).toBe(31);
    });

    it('31/03 + 1 mês vira 30/04 (mês de 30 dias)', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 2, 31, 12));
      banco.prisma.produto.findUnique.mockResolvedValue(
        produtoBase(
          [etapa('Análise documental', true, StatusCertificacao.APROVADO)],
          1,
        ) as never,
      );

      await servico.emitir(1, { escopo: 'Disjuntores' }, admin());

      const validade = validadeGravada();
      expect(validade.getMonth()).toBe(3);
      expect(validade.getDate()).toBe(30);
    });

    it('data explícita no payload vence a validade da categoria', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 31, 12));
      banco.prisma.produto.findUnique.mockResolvedValue(
        produtoBase(
          [etapa('Análise documental', true, StatusCertificacao.APROVADO)],
          12,
        ) as never,
      );

      await servico.emitir(
        1,
        { escopo: 'Disjuntores', dataValidade: '2030-06-15T00:00:00.000Z' },
        admin(),
      );

      expect(validadeGravada().toISOString()).toBe('2030-06-15T00:00:00.000Z');
    });

    it('recusa validade anterior ou igual à emissão', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 5, 1, 12));
      banco.prisma.produto.findUnique.mockResolvedValue(
        produtoBase([
          etapa('Análise documental', true, StatusCertificacao.APROVADO),
        ]) as never,
      );

      await expect(
        servico.emitir(
          1,
          { escopo: 'Disjuntores', dataValidade: '2020-01-01T00:00:00.000Z' },
          admin(),
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'A data de validade precisa ser posterior à data de emissão.',
        ),
      );
      expect(banco.transacoesAbertas).toBe(0);
    });
  });

  describe('emitir — autoria e numeração', () => {
    it('grava a autoria da sessão, nunca um campo do payload', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 31, 12));
      banco.prisma.produto.findUnique.mockResolvedValue(
        produtoBase([
          etapa('Análise documental', true, StatusCertificacao.APROVADO),
        ]) as never,
      );
      prepararEmissao();

      await servico.emitir(1, { escopo: 'Disjuntores' }, admin(7));

      const [{ data }] = banco.tx.certificado.create.mock.calls[0];
      expect(data.emitidoPorId).toBe(7);
      // Desnormalizado de propósito: a autoria sobrevive à exclusão do colaborador.
      expect(data.emitidoPorNome).toBe('Ana Administradora');
    });

    it('numera derivando do MAIOR número do ano, dentro da transação', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 31, 12));
      banco.prisma.produto.findUnique.mockResolvedValue(
        produtoBase([
          etapa('Análise documental', true, StatusCertificacao.APROVADO),
        ]) as never,
      );
      prepararEmissao();
      banco.tx.certificado.findFirst.mockResolvedValue({
        numero: 'PROCERT-2026-000044',
      } as never);

      await servico.emitir(1, { escopo: 'Disjuntores' }, admin());

      const [{ data }] = banco.tx.certificado.create.mock.calls[0];
      expect(data.numero).toBe('PROCERT-2026-000045');

      // A leitura do último número e a criação precisam estar no MESMO commit:
      // fora dele, duas emissões simultâneas leriam o mesmo 000044.
      expect(banco.chamadasNaTransacao).toEqual([
        'certificado.findFirst',
        'certificado.create',
      ]);
      expect(banco.chamadasForaDaTransacao).toEqual([]);
    });

    it('começa em 000001 quando o ano ainda não tem certificado', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 31, 12));
      banco.prisma.produto.findUnique.mockResolvedValue(
        produtoBase([
          etapa('Análise documental', true, StatusCertificacao.APROVADO),
        ]) as never,
      );
      prepararEmissao();

      await servico.emitir(1, { escopo: 'Disjuntores' }, admin());

      const [{ data }] = banco.tx.certificado.create.mock.calls[0];
      expect(data.numero).toBe('PROCERT-2026-000001');
    });

    it('falha na geração do PDF não derruba a emissão', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 31, 12));
      banco.prisma.produto.findUnique.mockResolvedValue(
        produtoBase([
          etapa('Análise documental', true, StatusCertificacao.APROVADO),
        ]) as never,
      );
      prepararEmissao();
      // `prepararEmissao` já faz o `findUniqueOrThrow` do PDF rejeitar.

      await expect(
        servico.emitir(1, { escopo: 'Disjuntores' }, admin()),
      ).resolves.toMatchObject({ numero: 'PROCERT-2026-000001' });

      // O certificado existe; o PDF é regerado no primeiro download.
      expect(banco.tx.certificado.create).toHaveBeenCalled();
      expect(servico['logger'].error).toHaveBeenCalledWith(
        expect.stringContaining('Falha ao gerar o PDF do certificado'),
      );
    });
  });

  describe('alterarStatus', () => {
    const vigente = {
      id: 55,
      status: StatusCertificado.EMITIDO,
      dataValidade: new Date(2030, 0, 1),
    };

    beforeEach(() => {
      banco.prisma.certificado.findUniqueOrThrow.mockResolvedValue(
        certificadoSalvo() as never,
      );
    });

    it('recusa VENCIDO aplicado manualmente — ele decorre da data', async () => {
      banco.prisma.certificado.findUnique.mockResolvedValue(vigente as never);

      await expect(
        servico.alterarStatus(55, { status: StatusCertificado.VENCIDO }),
      ).rejects.toThrow(
        new BadRequestException(
          'O vencimento decorre da data de validade e não pode ser aplicado manualmente.',
        ),
      );
      expect(banco.prisma.certificado.update).not.toHaveBeenCalled();
    });

    it('CANCELADO é terminal: não muda para nenhum outro estado', async () => {
      banco.prisma.certificado.findUnique.mockResolvedValue({
        ...vigente,
        status: StatusCertificado.CANCELADO,
      } as never);

      await expect(
        servico.alterarStatus(55, {
          status: StatusCertificado.EMITIDO,
          motivoStatus: 'tentativa de reativar',
        }),
      ).rejects.toThrow(
        new ConflictException(
          'Certificado cancelado não pode mudar de situação. Emita um novo.',
        ),
      );
      expect(banco.prisma.certificado.update).not.toHaveBeenCalled();
    });

    it.each([
      [StatusCertificado.SUSPENSO],
      [StatusCertificado.CANCELADO],
    ])('exige motivo ao aplicar %s', async (status) => {
      banco.prisma.certificado.findUnique.mockResolvedValue(vigente as never);

      await expect(servico.alterarStatus(55, { status })).rejects.toThrow(
        new BadRequestException(
          'Informe o motivo ao suspender ou cancelar um certificado.',
        ),
      );
    });

    it('não deixa certificado fora da validade voltar a vigorar', async () => {
      banco.prisma.certificado.findUnique.mockResolvedValue({
        ...vigente,
        status: StatusCertificado.SUSPENSO,
        dataValidade: new Date(2020, 0, 1),
      } as never);

      await expect(
        servico.alterarStatus(55, { status: StatusCertificado.EMITIDO }),
      ).rejects.toThrow(
        new BadRequestException(
          'Este certificado está fora da validade e não pode voltar a vigorar.',
        ),
      );
    });

    it('reativação limpa o motivo anterior', async () => {
      banco.prisma.certificado.findUnique.mockResolvedValue({
        ...vigente,
        status: StatusCertificado.SUSPENSO,
      } as never);

      await servico.alterarStatus(55, { status: StatusCertificado.EMITIDO });

      expect(banco.prisma.certificado.update).toHaveBeenCalledWith({
        where: { id: 55 },
        data: { status: StatusCertificado.EMITIDO, motivoStatus: null },
      });
    });

    it('suspensão grava o motivo informado', async () => {
      banco.prisma.certificado.findUnique.mockResolvedValue(vigente as never);

      await servico.alterarStatus(55, {
        status: StatusCertificado.SUSPENSO,
        motivoStatus: 'Auditoria de manutenção reprovada',
      });

      expect(banco.prisma.certificado.update).toHaveBeenCalledWith({
        where: { id: 55 },
        data: {
          status: StatusCertificado.SUSPENSO,
          motivoStatus: 'Auditoria de manutenção reprovada',
        },
      });
    });
  });

  describe('expirarVencidos', () => {
    it('marca como VENCIDO só os vigentes cuja validade passou', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 19, 12));
      banco.prisma.certificado.updateMany.mockResolvedValue({
        count: 3,
      } as never);

      const resultado = await servico.expirarVencidos();

      expect(banco.prisma.certificado.updateMany).toHaveBeenCalledWith({
        where: {
          // Cancelado fica de fora: é terminal. Suspenso vence normalmente.
          status: {
            in: [StatusCertificado.EMITIDO, StatusCertificado.SUSPENSO],
          },
          dataValidade: { lt: new Date(2026, 7, 19, 12) },
        },
        data: { status: StatusCertificado.VENCIDO },
      });
      expect(resultado).toEqual({
        mensagem: '3 certificado(s) marcado(s) como vencido(s).',
        atualizados: 3,
      });
      // O resultado precisa deixar rastro em log qualquer que seja o
      // acionador — o agendador diário ou a rota manual.
      expect(servico['logger'].log).toHaveBeenCalledWith(
        '3 certificado(s) marcado(s) como vencido(s).',
      );
    });

    it('é idempotente: a segunda passada não encontra nada e não é erro', async () => {
      banco.prisma.certificado.updateMany
        .mockResolvedValueOnce({ count: 2 } as never)
        .mockResolvedValueOnce({ count: 0 } as never);

      await expect(servico.expirarVencidos()).resolves.toMatchObject({
        atualizados: 2,
      });
      await expect(servico.expirarVencidos()).resolves.toEqual({
        mensagem: 'Nenhum certificado vencido a atualizar.',
        atualizados: 0,
      });
    });
  });

  describe('escopo do papel CLIENTE', () => {
    it('buscarPorId: cliente ALHEIO recebe ForbiddenException', async () => {
      banco.prisma.certificado.findUnique.mockResolvedValue(
        certificadoSalvo() as never,
      );

      await expect(
        servico.buscarPorId(55, cliente(CLIENTE_ALHEIO)),
      ).rejects.toThrow(
        new ForbiddenException(
          'Você só pode acessar os certificados dos seus produtos.',
        ),
      );
    });

    it('buscarPorId: cliente DONO acessa', async () => {
      banco.prisma.certificado.findUnique.mockResolvedValue(
        certificadoSalvo() as never,
      );

      await expect(
        servico.buscarPorId(55, cliente(CLIENTE_DONO)),
      ).resolves.toMatchObject({ numero: 'PROCERT-2026-000001' });
    });

    it('buscarPorId: equipe acessa certificado de qualquer cliente', async () => {
      banco.prisma.certificado.findUnique.mockResolvedValue(
        certificadoSalvo() as never,
      );

      await expect(
        servico.buscarPorId(55, funcionario()),
      ).resolves.toBeDefined();
    });

    it('listar: o clienteId do CLIENTE vem do token e IGNORA o filtro da URL', async () => {
      banco.prisma.certificado.findMany.mockResolvedValue([] as never);
      banco.prisma.certificado.count.mockResolvedValue(0 as never);

      const filtros = Object.assign(new ListarCertificadosDto(), {
        clienteId: CLIENTE_ALHEIO, // tentativa de ver a carteira do vizinho
      });

      await servico.listar(filtros, cliente(CLIENTE_DONO));

      const argumentos = banco.prisma.certificado.findMany.mock.calls[0][0]!;
      expect(argumentos.where).toMatchObject({
        produto: { clienteId: CLIENTE_DONO },
      });
    });

    it('listar: a equipe pode filtrar por clienteId livremente', async () => {
      banco.prisma.certificado.findMany.mockResolvedValue([] as never);
      banco.prisma.certificado.count.mockResolvedValue(0 as never);

      const filtros = Object.assign(new ListarCertificadosDto(), {
        clienteId: CLIENTE_ALHEIO,
      });

      await servico.listar(filtros, funcionario());

      const argumentos = banco.prisma.certificado.findMany.mock.calls[0][0]!;
      expect(argumentos.where).toMatchObject({
        produto: { clienteId: CLIENTE_ALHEIO },
      });
    });

    it('listar: consulta e contagem saem no MESMO snapshot ($transaction)', async () => {
      banco.prisma.certificado.findMany.mockResolvedValue([] as never);
      banco.prisma.certificado.count.mockResolvedValue(0 as never);

      await servico.listar(new ListarCertificadosDto(), admin());

      expect(banco.transacoesAbertas).toBe(1);
    });

    it('listarPorProduto: cliente alheio recebe 403 antes de ver qualquer número', async () => {
      banco.prisma.produto.findUnique.mockResolvedValue({
        clienteId: CLIENTE_DONO,
      } as never);

      await expect(
        servico.listarPorProduto(1, cliente(CLIENTE_ALHEIO)),
      ).rejects.toThrow(ForbiddenException);
      expect(banco.prisma.certificado.findMany).not.toHaveBeenCalled();
    });
  });
});
