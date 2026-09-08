import { ForbiddenException } from '@nestjs/common';
import {
  FaseProcesso,
  PapelFuncional,
  StatusCertificacao,
} from '@prisma/client';

import {
  ALERTAS_AGING,
  calcularSla,
  COLUNAS_QUADRO,
  QuadroService,
  semaforoDoAging,
} from './quadro.service';
import { PrismaService } from '../../prisma/prisma.service';
import { criarPrismaMock, PrismaMock } from '../../testing/prisma.mock';
import { admin, cliente } from '../../testing/usuarios.fixture';

/**
 * Linha crua como o `$queryRaw` a devolve — com `bigint` nas contagens, que é
 * o que o driver entrega e o que o service precisa converter. Um teste que
 * usasse `number` aqui passaria e a API devolveria `"3n"` em produção.
 */
const linha = (extra: Record<string, unknown> = {}) => ({
  produto_id: 1,
  codigo_processo: 'PROCERT-EPI-012-26',
  produto: 'Cinturão paraquedista',
  motivo_processo: 'INICIAL',
  cliente_id: 100,
  cliente_nome: 'Indústria Alfa',
  categoria_id: 7,
  categoria_nome: 'EPIs de altura',
  etapa_id: 10,
  etapa_nome: 'Ensaios laboratoriais',
  etapa_status: StatusCertificacao.EM_ANDAMENTO,
  papel_responsavel: PapelFuncional.TECNICO,
  prazo_sla_horas: null,
  iniciada_em: null,
  total_etapas: 4n,
  etapas_aprovadas: 1n,
  dias_em_aberto: 5,
  concluido: false,
  cancelado_em: null,
  motivo_cancelamento: null,
  cancelado_por_nome: null,
  ncs_abertas: 0n,
  coluna: FaseProcesso.ENSAIOS_LABORATORIO,
  total_da_coluna: 1n,
  ...extra,
});

describe('QuadroService', () => {
  let servico: QuadroService;
  let banco: PrismaMock;

  beforeEach(() => {
    jest.clearAllMocks();
    banco = criarPrismaMock();
    banco.prisma.$queryRaw.mockResolvedValue([] as never);
    servico = new QuadroService(banco.prisma as unknown as PrismaService);
  });

  describe('escopo — o quadro é visão interna', () => {
    it('CLIENTE recebe ForbiddenException e nada é consultado', async () => {
      // O @Roles do controller já barra, mas a regra do projeto é que o escopo
      // viva TAMBÉM no service: uma rota nova que esqueça o decorator não pode
      // abrir a organização interna da operação.
      await expect(servico.listar({}, cliente())).rejects.toThrow(
        ForbiddenException,
      );
      expect(banco.prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('a equipe consulta normalmente', async () => {
      await expect(servico.listar({}, admin())).resolves.toBeDefined();
      expect(banco.prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('montagem das colunas', () => {
    it('devolve TODAS as colunas, inclusive as vazias', async () => {
      // Fase que some da tela vira etapa do processo que ninguém lembra que
      // existe — e o quadro passa a descrever um pipeline que não é o real.
      const quadro = await servico.listar({}, admin());

      expect(quadro.colunas.map((c) => c.fase)).toEqual([...COLUNAS_QUADRO]);
      expect(quadro.colunas.every((c) => c.total === 0)).toBe(true);
    });

    it('as colunas derivadas vêm depois das fases do enum', async () => {
      const quadro = await servico.listar({}, admin());
      const nomes = quadro.colunas.map((c) => c.fase);

      expect(nomes.at(0)).toBe(FaseProcesso.ABERTURA);
      // Fases do pipeline, depois os dois desfechos.
      expect(nomes.slice(-2)).toEqual(['CONCLUIDO', 'CANCELADO']);
    });

    it('converte os bigint das contagens em number', async () => {
      banco.prisma.$queryRaw.mockResolvedValue([linha()] as never);

      const quadro = await servico.listar({}, admin());
      const coluna = quadro.colunas.find(
        (c) => c.fase === FaseProcesso.ENSAIOS_LABORATORIO,
      )!;

      expect(coluna.total).toBe(1);
      expect(typeof coluna.total).toBe('number');
      expect(coluna.cartoes[0].totalEtapas).toBe(4);
      expect(coluna.cartoes[0].naoConformidadesAbertas).toBe(0);
    });

    it('progresso é percentual de aprovadas sobre o total', async () => {
      banco.prisma.$queryRaw.mockResolvedValue([
        linha({ total_etapas: 4n, etapas_aprovadas: 1n }),
      ] as never);

      const quadro = await servico.listar({}, admin());
      const cartao = quadro.colunas.find(
        (c) => c.fase === FaseProcesso.ENSAIOS_LABORATORIO,
      )!.cartoes[0];

      expect(cartao.progresso).toBe(25);
    });

    it('produto sem etapa nenhuma não divide por zero', async () => {
      banco.prisma.$queryRaw.mockResolvedValue([
        linha({
          total_etapas: 0n,
          etapas_aprovadas: 0n,
          etapa_id: null,
          etapa_nome: null,
          etapa_status: null,
          papel_responsavel: null,
          coluna: FaseProcesso.ABERTURA,
        }),
      ] as never);

      const quadro = await servico.listar({}, admin());
      const cartao = quadro.colunas[0].cartoes[0];

      expect(cartao.progresso).toBe(0);
      expect(cartao.etapaAtual).toBeNull();
    });

    it('`limitePorFase` não afeta o `total` da coluna', async () => {
      // A contagem vem de COUNT(*) OVER (PARTITION BY coluna), calculada antes
      // do corte. Um quadro que mostra 2 cartões e diz "2" havendo 87 esconde
      // a fila em vez de mostrá-la.
      banco.prisma.$queryRaw.mockResolvedValue([
        linha({ produto_id: 1, total_da_coluna: 87n }),
        linha({ produto_id: 2, total_da_coluna: 87n }),
      ] as never);

      const quadro = await servico.listar({ limitePorFase: 2 }, admin());
      const coluna = quadro.colunas.find(
        (c) => c.fase === FaseProcesso.ENSAIOS_LABORATORIO,
      )!;

      expect(coluna.cartoes).toHaveLength(2);
      expect(coluna.total).toBe(87);
    });

    it('processo CONCLUIDO não acende semáforo', async () => {
      // `null` é ausência de sinal, e é diferente de VERDE. Verde afirmaria
      // "está dentro do prazo"; um processo encerrado não está dentro nem fora
      // de prazo nenhum, ele acabou — e um semáforo aceso numa coluna terminal
      // disputaria atenção com o que ainda precisa de ação.
      banco.prisma.$queryRaw.mockResolvedValue([
        linha({ coluna: 'CONCLUIDO', concluido: true, dias_em_aberto: 400 }),
      ] as never);

      const quadro = await servico.listar({}, admin());
      // CONCLUIDO é a penúltima desde que CANCELADO entrou no fim.
      const cartao = quadro.colunas.find((c) => c.fase === 'CONCLUIDO')!.cartoes[0];

      expect(cartao.concluido).toBe(true);
      expect(cartao.semaforo).toBeNull();
      // O tempo total continua disponível — é outro relógio, com nome próprio
      // na tela, e o número em si não some.
      expect(cartao.diasEmAberto).toBe(400);
    });

    it('processo em andamento acende o semáforo normalmente', async () => {
      banco.prisma.$queryRaw.mockResolvedValue([
        linha({ concluido: false, dias_em_aberto: 400 }),
      ] as never);

      const quadro = await servico.listar({}, admin());
      const cartao = quadro.colunas.find(
        (c) => c.fase === FaseProcesso.ENSAIOS_LABORATORIO,
      )!.cartoes[0];

      expect(cartao.concluido).toBe(false);
      expect(cartao.semaforo).toBe('VERMELHO');
    });

    it('processo CANCELADO não acende semáforo nem mostra SLA', async () => {
      // Cancelado não é um desfecho de prazo: é a ausência de desfecho. Verde
      // afirmaria "dentro do prazo" e vermelho cobraria uma ação que ninguém
      // vai tomar.
      banco.prisma.$queryRaw.mockResolvedValue([
        linha({
          coluna: 'CANCELADO',
          cancelado_em: new Date('2026-09-01T10:00:00Z'),
          motivo_cancelamento: 'Cliente desistiu.',
          cancelado_por_nome: 'Ana Administradora',
          dias_em_aberto: 400,
        }),
      ] as never);

      const quadro = await servico.listar({}, admin());
      const cartao = quadro.colunas.at(-1)!.cartoes[0];

      expect(cartao.semaforo).toBeNull();
      expect(cartao.cancelamento).toMatchObject({
        motivo: 'Cliente desistiu.',
        por: 'Ana Administradora',
      });
    });

    it('CANCELADO é a última coluna, depois de CONCLUIDO', async () => {
      // A ordem é a leitura do fluxo: fases, desfecho bom, desfecho
      // interrompido.
      const quadro = await servico.listar({}, admin());
      const nomes = quadro.colunas.map((c) => c.fase);

      expect(nomes.at(-1)).toBe('CANCELADO');
      expect(nomes.at(-2)).toBe('CONCLUIDO');
    });

    it('o limite padrão é 50 e viaja na resposta', async () => {
      const quadro = await servico.listar({}, admin());
      expect(quadro.limitePorFase).toBe(50);
      expect(quadro.limiares).toEqual(ALERTAS_AGING);
    });
  });
});

/**
 * O semáforo reproduz as etiquetas 30/20/15 que a operação aplicava À MÃO no
 * quadro Trello. Os cortes são o que a tela colore, então errar a borda por um
 * dia pinta de verde um processo que a Qualidade já considerava atrasado.
 */
describe('semaforoDoAging', () => {
  it('verde abaixo do limiar amarelo', () => {
    expect(semaforoDoAging(0)).toBe('VERDE');
    expect(semaforoDoAging(ALERTAS_AGING.amarelo - 1)).toBe('VERDE');
  });

  it('amarelo A PARTIR do limiar, não depois dele', () => {
    // `>=`, não `>`: no dia 20 o processo já entrou na faixa de atenção.
    expect(semaforoDoAging(ALERTAS_AGING.amarelo)).toBe('AMARELO');
    expect(semaforoDoAging(ALERTAS_AGING.vermelho - 1)).toBe('AMARELO');
  });

  it('vermelho a partir do limiar vermelho', () => {
    expect(semaforoDoAging(ALERTAS_AGING.vermelho)).toBe('VERMELHO');
    expect(semaforoDoAging(900)).toBe('VERMELHO');
  });
});

/**
 * `prazoLimiteEm` é cálculo puro (`iniciadaEm + prazoSlaHoras`) e não coluna do
 * banco: persistir derivado cria uma linha que envelhece sozinha.
 */
describe('calcularSla', () => {
  const agora = new Date('2026-09-05T12:00:00Z');
  const iniciada = new Date('2026-09-05T00:00:00Z');

  it('SEM_PRAZO quando a etapa não tem SLA acordado', () => {
    expect(calcularSla(null, iniciada, agora)).toEqual({
      situacao: 'SEM_PRAZO',
    });
  });

  it('NAO_INICIADA é estado PRÓPRIO, não o mesmo de "sem prazo"', () => {
    // Os dois eram `null` na primeira versão e a tela renderizava o mesmo "—".
    // Mas "tem prazo e ninguém começou" é processo PARADO NA FILA — o que o
    // quadro existe para mostrar —, e some se colapsar com "não tem prazo".
    expect(calcularSla(24, null, agora)).toEqual({
      situacao: 'NAO_INICIADA',
      prazoHoras: 24,
    });
  });

  it('o prazo viaja junto no estado NAO_INICIADA', () => {
    // Para a tela poder dizer QUAL prazo está esperando para começar a correr.
    const sla = calcularSla(72, null, agora);
    expect(sla).toHaveProperty('prazoHoras', 72);
  });

  it('dentro do prazo: horas restantes positivas, não estourado', () => {
    const sla = calcularSla(24, iniciada, agora);

    expect(sla).toEqual({
      situacao: 'EM_CONTAGEM',
      prazoHoras: 24,
      limiteEm: new Date('2026-09-06T00:00:00Z'),
      horasRestantes: 12,
      estourado: false,
    });
  });

  it('estourado: horas restantes NEGATIVAS, e o sinal é a informação', () => {
    // Zerar em 0 esconderia o tamanho do atraso, que é o que a Qualidade
    // precisa para priorizar entre dois processos vencidos.
    const sla = calcularSla(8, iniciada, agora);

    expect(sla).toMatchObject({ horasRestantes: -4, estourado: true });
  });

  it('arredonda para uma casa: o quadro mostra 3,5h, não microssegundos', () => {
    const sla = calcularSla(
      12,
      new Date('2026-09-05T00:00:00Z'),
      new Date('2026-09-05T08:29:59Z'),
    );

    expect(sla).toHaveProperty('horasRestantes', 3.5);
  });

  it('exatamente no limite ainda não está estourado', () => {
    const sla = calcularSla(12, iniciada, new Date('2026-09-05T12:00:00Z'));

    expect(sla).toMatchObject({ horasRestantes: 0, estourado: false });
  });
});
