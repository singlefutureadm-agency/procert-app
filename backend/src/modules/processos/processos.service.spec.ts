import { Prisma, Role, StatusRegistro } from '@prisma/client';
import { mockDeep } from 'jest-mock-extended';

import { ProcessosService } from './processos.service';
import { ModelosTrilhaService } from '../modelos-trilha/modelos-trilha.service';
import { UploadsService } from '../uploads/uploads.service';
import { PrismaService } from '../../prisma/prisma.service';
import { criarPrismaMock, PrismaMock } from '../../testing/prisma.mock';

const CLIENTE = 100;
const CATEGORIA = 7;

/**
 * O código do processo (`PROCERT-EPI-012-26`) é o identificador com que a
 * operação chama cada processo — vinha no título do card do quadro. Duas
 * propriedades dele não geram erro quando quebram, e é por isso que estão
 * cobertas aqui: um sequencial derivado de `COUNT` reemite número após uma
 * exclusão, e uma corrida entre duas aberturas simultâneas grava o mesmo
 * código nas duas.
 */
describe('ProcessosService — código do processo', () => {
  let servico: ProcessosService;
  let banco: PrismaMock;
  let modelosTrilha: jest.Mocked<ModelosTrilhaService>;

  const categoria = (sigla: string | null) => ({
    id: CATEGORIA,
    nome: 'EPIs para trabalho em altura',
    sigla,
    status: StatusRegistro.ATIVO,
  });

  /** Payload mínimo aceito por `criar`. */
  const dados = {
    clienteId: CLIENTE,
    categoriaId: CATEGORIA,
    nome: 'Cinturão paraquedista',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-09-05T12:00:00Z'));

    banco = criarPrismaMock();
    modelosTrilha = mockDeep<ModelosTrilhaService>();

    banco.prisma.cliente.findUnique.mockResolvedValue({ id: CLIENTE } as never);
    banco.prisma.categoriaProcesso.findUnique.mockResolvedValue(
      categoria('EPI') as never,
    );
    modelosTrilha.resolverVigentePorCategoria.mockResolvedValue({
      id: 80,
      etapas: [{ id: 900, ordem: 1, microEtapas: [] }],
    } as never);

    banco.tx.processo.create.mockResolvedValue({ id: 1 } as never);
    banco.tx.processo.findUniqueOrThrow.mockResolvedValue({ id: 1 } as never);

    servico = new ProcessosService(
      banco.prisma as unknown as PrismaService,
      mockDeep<UploadsService>(),
      modelosTrilha,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** O `data` do único `processo.create` da transação. */
  const dadosDoCreate = () => banco.tx.processo.create.mock.calls[0][0].data;

  /**
   * O `MAX(...)` do gerador: o mock devolve o número já extraído.
   *
   * LIMITE CONHECIDO: com o `$queryRaw` mockado, estes casos provam a
   * ARITMÉTICA do sequencial, não o SQL. O próprio SQL só é exercitado contra
   * um Postgres de verdade — e foi assim que se descobriu que o Prisma envia
   * número de JS como `bigint`, para o qual não existe
   * `substring(varchar, bigint, bigint)`: erro 42883 em execução, com o
   * type-check e esta suíte verdes. Daí os `::int` no service.
   */
  const maximoNaBase = (maximo: number | null) =>
    banco.prisma.$queryRaw.mockResolvedValue([{ maximo }] as never);

  it('deriva do MAIOR número do ano, não de uma contagem', async () => {
    // `COUNT` reemitiria um número já usado assim que um processo fosse
    // excluído — dois processos com o mesmo código é o que a operação não
    // pode ter. Mesma razão já registrada em `nao-conformidades`.
    maximoNaBase(11);

    await servico.criar(dados);

    expect(dadosDoCreate().codigoProcesso).toBe('PROCERT-EPI-012-26');
    expect(banco.prisma.processo.count).not.toHaveBeenCalled();
  });

  it('começa em 001 no primeiro processo do ano', async () => {
    maximoNaBase(null);

    await servico.criar(dados);

    expect(dadosDoCreate().codigoProcesso).toBe('PROCERT-EPI-001-26');
  });

  it('passa de 999 para 1000, e de 1000 para 1001', async () => {
    // O defeito que `ORDER BY codigo_processo DESC` tinha: ordenação de TEXTO
    // só coincide com a numérica enquanto a largura é fixa. Com 1000 na base,
    // o maior lexicográfico volta a ser "999" e o próximo código sairia 1000
    // outra vez — colidindo com um identificador que já circulou fora do
    // sistema. Por isso o máximo sai de MAX(número extraído).
    maximoNaBase(999);
    await servico.criar(dados);
    expect(dadosDoCreate().codigoProcesso).toBe('PROCERT-EPI-1000-26');

    jest.clearAllMocks();
    banco.prisma.cliente.findUnique.mockResolvedValue({ id: CLIENTE } as never);
    banco.prisma.categoriaProcesso.findUnique.mockResolvedValue(
      categoria('EPI') as never,
    );
    modelosTrilha.resolverVigentePorCategoria.mockResolvedValue({
      id: 80,
      etapas: [{ id: 900, ordem: 1, microEtapas: [] }],
    } as never);
    banco.tx.processo.create.mockResolvedValue({ id: 2 } as never);
    banco.tx.processo.findUniqueOrThrow.mockResolvedValue({ id: 2 } as never);
    maximoNaBase(1000);

    await servico.criar(dados);
    expect(dadosDoCreate().codigoProcesso).toBe('PROCERT-EPI-1001-26');
  });

  it('o zero à esquerda é largura MÍNIMA, não fixa', async () => {
    // 001..999 mantêm três casas; acima disso o contador cresce, como qualquer
    // contador que estoura a casa reservada.
    maximoNaBase(8);
    await servico.criar(dados);
    expect(dadosDoCreate().codigoProcesso).toBe('PROCERT-EPI-009-26');
  });

  it('o sequencial é por SIGLA: cada categoria numera a sua', async () => {
    // `PROCERT-EPI-012-26` e `PROCERT-VOL-012-26` convivem — é assim que a
    // operação já numera. O LIKE precisa casar prefixo E sufixo.
    banco.prisma.categoriaProcesso.findUnique.mockResolvedValue(
      categoria('VOL') as never,
    );
    maximoNaBase(null);

    await servico.criar(dados);

    expect(dadosDoCreate().codigoProcesso).toBe('PROCERT-VOL-001-26');
    // O padrão do LIKE viaja como parâmetro da consulta, não interpolado.
    const parametros = banco.prisma.$queryRaw.mock.calls[0][0] as {
      values: unknown[];
    };
    expect(parametros.values).toContain('PROCERT-VOL-%-26');
  });

  it('categoria SEM sigla gera processo sem código, e não um erro', async () => {
    // Nenhum identificador é melhor que um inventado: o código circula em
    // documento fora do sistema.
    banco.prisma.categoriaProcesso.findUnique.mockResolvedValue(
      categoria(null) as never,
    );

    await servico.criar(dados);

    expect(dadosDoCreate().codigoProcesso).toBeNull();
    // E não consulta o máximo à toa.
    expect(banco.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('o ano vem com dois dígitos e acompanha o relógio', async () => {
    jest.setSystemTime(new Date('2027-01-02T09:00:00Z'));
    maximoNaBase(null);

    await servico.criar(dados);

    expect(dadosDoCreate().codigoProcesso).toBe('PROCERT-EPI-001-27');
  });

  it('corrida no código: repete em vez de devolver 409', async () => {
    // Duas aberturas simultâneas leem o mesmo máximo e tentam o mesmo número.
    // Quem decide é o índice único; a perdedora tenta de novo, porque quem
    // está do outro lado só queria cadastrar um processo.
    const colisao = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { target: ['codigo_processo'] },
      },
    );

    banco.prisma.$queryRaw
      .mockResolvedValueOnce([{ maximo: 11 }] as never)
      .mockResolvedValueOnce([{ maximo: 12 }] as never);
    banco.tx.processo.create
      .mockRejectedValueOnce(colisao)
      .mockResolvedValueOnce({ id: 1 } as never);

    await servico.criar(dados);

    // Releu o máximo e gravou o número seguinte.
    expect(banco.tx.processo.create).toHaveBeenCalledTimes(2);
    expect(
      banco.tx.processo.create.mock.calls[1][0].data.codigoProcesso,
    ).toBe('PROCERT-EPI-013-26');
  });

  it('não repete em erro que não seja colisão de código', async () => {
    // Retry cego transformaria uma falha de FK em três tentativas idênticas.
    const outroErro = new Prisma.PrismaClientKnownRequestError('FK', {
      code: 'P2003',
      clientVersion: '6.19.3',
    });
    maximoNaBase(null);
    banco.tx.processo.create.mockRejectedValue(outroErro);

    await expect(servico.criar(dados)).rejects.toThrow(outroErro);
    expect(banco.tx.processo.create).toHaveBeenCalledTimes(1);
  });

  it('a trilha nasce no MESMO commit do processo', async () => {
    // Diferença em relação ao legado: lá, uma falha no INSERT das etapas
    // deixava o processo órfão, sem certificação nenhuma.
    maximoNaBase(null);

    await servico.criar(dados);

    // `create` por etapa, e não `createMany`: as microetapas são relação
    // aninhada, e o `createMany` abriria a trilha com os checklists vazios.
    expect(banco.tx.certificacaoProcesso.create).toHaveBeenCalledTimes(1);
    expect(banco.tx.certificacaoProcesso.createMany).not.toHaveBeenCalled();
    expect(banco.prisma.processo.create).not.toHaveBeenCalled();
  });
});

/**
 * O DONO do processo — a pessoa que vai receber aviso sobre ele.
 *
 * Nada aqui gera stack trace quando quebra, e é por isso que está coberto:
 *
 *  - um responsável DESATIVADO passa pela FK sem reclamar. A tela mostraria um
 *    nome, e o aviso iria para uma conta que ninguém abre — "sem responsável",
 *    mas sem parecer. A FK não sabe distinguir; o service sabe.
 *  - o filtro usa `0` para dizer "sem responsável". Repassado cru ao `where`,
 *    nenhum id casa (ids começam em 1) e a tela diz "nenhum processo", que se
 *    lê como "ninguém tem processo" em vez de "o filtro está errado".
 *  - e a AUSÊNCIA de filtro não pode virar filtro: este campo endereça aviso,
 *    não restringe acesso, e um `responsavelId: undefined` escapando para o
 *    `where` esconderia processo da equipe sem nenhum aviso.
 */
describe('ProcessosService — responsável do processo', () => {
  let servico: ProcessosService;
  let banco: PrismaMock;
  let modelosTrilha: jest.Mocked<ModelosTrilhaService>;

  const RESPONSAVEL = 3;

  const equipe = {
    id: 1,
    nome: 'Ana Qualidade',
    email: 'ana@procertocp.com.br',
    role: Role.FUNCIONARIO,
  };

  const dados = {
    clienteId: CLIENTE,
    categoriaId: CATEGORIA,
    nome: 'Cinturão paraquedista',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    banco = criarPrismaMock();
    modelosTrilha = mockDeep<ModelosTrilhaService>();

    banco.prisma.cliente.findUnique.mockResolvedValue({ id: CLIENTE } as never);
    banco.prisma.categoriaProcesso.findUnique.mockResolvedValue({
      id: CATEGORIA,
      nome: 'EPIs para trabalho em altura',
      sigla: null,
      status: StatusRegistro.ATIVO,
    } as never);
    modelosTrilha.resolverVigentePorCategoria.mockResolvedValue({
      id: 80,
      etapas: [{ id: 900, ordem: 1, microEtapas: [] }],
    } as never);

    banco.tx.processo.create.mockResolvedValue({ id: 1 } as never);
    banco.tx.processo.findUniqueOrThrow.mockResolvedValue({ id: 1 } as never);
    banco.prisma.processo.findUnique.mockResolvedValue({ id: 1 } as never);
    banco.prisma.processo.update.mockResolvedValue({ id: 1 } as never);
    // A listagem é `$transaction([findMany, count])`. NÃO sobrescreva o
    // `$transaction` do mock para isso: ele atende as duas formas, e um
    // `mockResolvedValue` aqui derrubaria a de callback que `criar` usa.
    banco.prisma.processo.findMany.mockResolvedValue([] as never);
    banco.prisma.processo.count.mockResolvedValue(0 as never);

    servico = new ProcessosService(
      banco.prisma as unknown as PrismaService,
      mockDeep<UploadsService>(),
      modelosTrilha,
    );
  });

  /** O `where` do `findMany` montado por `listar`. */
  const whereDaListagem = () =>
    banco.prisma.processo.findMany.mock.calls[0][0]!.where;

  const funcionario = (status: StatusRegistro) =>
    banco.prisma.funcionario.findUnique.mockResolvedValue({
      id: RESPONSAVEL,
      status,
    } as never);

  it('recusa funcionário DESATIVADO como responsável', async () => {
    funcionario(StatusRegistro.INATIVO);

    await expect(
      servico.criar({ ...dados, responsavelId: RESPONSAVEL }),
    ).rejects.toThrow('O responsável precisa ser um funcionário ativo.');

    expect(banco.tx.processo.create).not.toHaveBeenCalled();
  });

  it('recusa funcionário inexistente como responsável', async () => {
    banco.prisma.funcionario.findUnique.mockResolvedValue(null as never);

    await expect(
      servico.criar({ ...dados, responsavelId: 999 }),
    ).rejects.toThrow('não encontrado para ser o responsável');
  });

  it('grava o responsável ativo no mesmo create do processo', async () => {
    funcionario(StatusRegistro.ATIVO);

    await servico.criar({ ...dados, responsavelId: RESPONSAVEL });

    expect(banco.tx.processo.create.mock.calls[0][0].data.responsavelId).toBe(
      RESPONSAVEL,
    );
  });

  it('aceita `null` na atualização: desatribuir é pedido explícito', async () => {
    // O `null` tem de passar sem consultar funcionário nenhum — "deixe sem
    // dono" é uma decisão, não um id a validar.
    await servico.atualizar(1, { responsavelId: null });

    expect(banco.prisma.funcionario.findUnique).not.toHaveBeenCalled();
    expect(banco.prisma.processo.update.mock.calls[0][0].data).toEqual({
      responsavelId: null,
    });
  });

  it('não consulta funcionário quando o campo não foi enviado', async () => {
    await servico.criar(dados);

    expect(banco.prisma.funcionario.findUnique).not.toHaveBeenCalled();
  });

  it('filtro `0` lista os SEM responsável, não o id 0', async () => {
    await servico.listar({ pagina: 1, limite: 20, skip: 0, responsavelId: 0 }, equipe);

    expect(whereDaListagem()).toMatchObject({ responsavelId: null });
  });

  it('filtro com id real recorta a carteira daquele funcionário', async () => {
    await servico.listar(
      { pagina: 1, limite: 20, skip: 0, responsavelId: RESPONSAVEL },
      equipe,
    );

    expect(whereDaListagem()).toMatchObject({ responsavelId: RESPONSAVEL });
  });

  it('sem o filtro, o responsável NÃO entra no where', async () => {
    // Endereça aviso, não restringe acesso: a equipe continua vendo tudo.
    await servico.listar({ pagina: 1, limite: 20, skip: 0 }, equipe);

    expect(whereDaListagem()).not.toHaveProperty('responsavelId');
  });
});
