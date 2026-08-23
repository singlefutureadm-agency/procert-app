import { Workbook, type Worksheet } from 'exceljs';
import {
  CriticidadeNaoConformidade,
  StatusCertificacao,
  StatusNaoConformidade,
  TipoEtapa,
} from '@prisma/client';

import type { CertificacoesService } from './certificacoes.service';
import { ExportacaoCertificacaoService } from './exportacao.service';

/**
 * O e2e da exportação baixa o arquivo e confere o `Content-Disposition`, mas
 * não ABRE a planilha. Toda regra desta suíte só quebraria na frente do
 * usuário, ao abrir o XLSX no Excel — ou, no caso dos nomes de aba, num 500 na
 * geração. Nenhuma delas é alcançável por teste de rota.
 */

type Detalhe = Awaited<ReturnType<CertificacoesService['detalharPorProduto']>>;
type Etapa = Detalhe['etapas'][number];
type Historico = Etapa['historico'][number];
type NaoConformidade = Etapa['naoConformidades'][number];
type Documento = Historico['documentos'][number];

// --------------------------------------------------------------- fixtures

let sequencia = 0;
const proximoId = () => ++sequencia;

function documento(over: Partial<Documento> = {}): Documento {
  return {
    id: proximoId(),
    nomeArquivo: 'relatorio-ensaio.pdf',
    tipoMime: 'application/pdf',
    tamanhoBytes: 4096,
    enviadoPorNome: 'Ana Técnica',
    criadoEm: new Date('2026-03-10T14:05:00Z'),
    ...over,
  };
}

function historico(over: Partial<Historico> = {}): Historico {
  return {
    id: proximoId(),
    statusAnterior: StatusCertificacao.PENDENTE,
    statusNovo: StatusCertificacao.EM_ANDAMENTO,
    observacao: 'Documentação recebida.',
    alteradoPorNome: 'Ana Técnica',
    alteradoEm: new Date('2026-03-10T14:05:00Z'),
    documentos: [],
    ...over,
  };
}

function naoConformidade(over: Partial<NaoConformidade> = {}): NaoConformidade {
  return {
    id: proximoId(),
    codigo: 'NC-2026-000001',
    descricao: 'Ensaio de isolação fora do limite.',
    criticidade: CriticidadeNaoConformidade.MAIOR,
    status: StatusNaoConformidade.ABERTA,
    prazoResposta: new Date('2026-03-20T00:00:00Z'),
    respostaCliente: null,
    respondidoEm: null,
    parecer: null,
    abertoPorNome: 'Ana Técnica',
    resolvidoEm: null,
    criadoEm: new Date('2026-03-11T09:00:00Z'),
    ...over,
  };
}

function etapa(
  over: Partial<Omit<Etapa, 'etapa'>> & { etapa?: Partial<Etapa['etapa']> } = {},
): Etapa {
  const { etapa: modelo, ...resto } = over;
  return {
    id: proximoId(),
    ordem: 1,
    status: StatusCertificacao.EM_ANDAMENTO,
    observacao: null,
    atualizadoEm: new Date('2026-03-10T14:05:00Z'),
    etapa: {
      id: proximoId(),
      nome: 'Análise documental',
      descricao: null,
      tipo: TipoEtapa.DOCUMENTAL,
      obrigatoria: true,
      exigeDocumento: false,
      ...modelo,
    },
    naoConformidades: [],
    historico: [],
    ...resto,
  };
}

function produtoFixo(nome: string): Detalhe['produto'] {
  return { id: 1, nome, descricao: null, fotoUrl: null };
}

function detalhe(etapas: Etapa[], over: Partial<Detalhe> = {}): Detalhe {
  const aprovadas = etapas.filter(
    (e) => e.status === StatusCertificacao.APROVADO,
  ).length;

  return {
    produto: produtoFixo('Disjuntor DIN 25A'),
    cliente: {
      id: 100,
      nome: 'Indústria Alfa',
      email: 'contato@alfa.com.br',
      telefone: '(11) 3333-4444',
      fotoUrl: null,
    },
    etapas,
    resumo: {
      totalEtapas: etapas.length,
      etapasAprovadas: aprovadas,
      progresso: etapas.length
        ? Math.round((aprovadas / etapas.length) * 100)
        : 0,
      concluida: etapas.length > 0 && aprovadas === etapas.length,
      obrigatoriasAprovadas:
        etapas.length > 0 &&
        etapas.every(
          (e) =>
            !e.etapa.obrigatoria || e.status === StatusCertificacao.APROVADO,
        ),
    },
    ...over,
  };
}

// ---------------------------------------------------------------- helpers

/** Grava e relê o buffer — é a releitura que prova que o Excel aceitaria. */
async function gerarEReabrir(
  servico: ExportacaoCertificacaoService,
  d: Detalhe,
): Promise<Workbook> {
  const buffer = await servico.xlsx(d, 'Ana Técnica');
  const livro = new Workbook();
  await livro.xlsx.load(buffer as unknown as ArrayBuffer);
  return livro;
}

/** Número da primeira linha cuja célula 1 tem exatamente este texto. */
function linhaComRotulo(aba: Worksheet, rotulo: string): number | null {
  let achada: number | null = null;
  aba.eachRow((linha, numero) => {
    if (achada === null && linha.getCell(1).value === rotulo) achada = numero;
  });
  return achada;
}

describe('ExportacaoCertificacaoService', () => {
  let servico: ExportacaoCertificacaoService;
  let avisos: jest.SpyInstance;

  beforeEach(() => {
    sequencia = 0;
    servico = new ExportacaoCertificacaoService();
    // O exceljs avisa por console.warn ao truncar nome de aba, e um dos testes
    // daqui exercita exatamente isso — o ruído poluiria a saída da suíte.
    avisos = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => avisos.mockRestore());

  // --------------------------------------------------------- nomes de aba

  describe('nomes de aba', () => {
    it('o saneamento é necessário: o exceljs recusa o nome cru', () => {
      // Prova que `nomeAba` não é decorativo. Sem ele, uma trilha com a etapa
      // "Ensaio 1/2" viraria 500 na geração — não uma planilha estranha.
      const livro = new Workbook();
      expect(() => livro.addWorksheet('1. Ensaio 1/2')).toThrow(
        /cannot include/i,
      );
      expect(() => livro.addWorksheet('')).toThrow(/empty/i);
    });

    it('troca os caracteres que o Excel proíbe e ainda gera o arquivo', async () => {
      const livro = await gerarEReabrir(
        servico,
        detalhe([
          etapa({ ordem: 1, etapa: { nome: 'Ensaio 1/2 [A]' } }),
          etapa({ ordem: 2, etapa: { nome: 'Auditoria: fase * final?' } }),
        ]),
      );

      const nomes = livro.worksheets.map((a) => a.name);
      expect(nomes).toContain('1. Ensaio 1-2 -A-');
      expect(nomes).toContain('2. Auditoria- fase - final-');
      for (const nome of nomes) {
        expect(nome).not.toMatch(/[\\/?*[\]:]/);
      }
    });

    it('prefixa com a ordem da trilha, na sequência do produto', async () => {
      const livro = await gerarEReabrir(
        servico,
        detalhe([
          etapa({ ordem: 1, etapa: { nome: 'Documental' } }),
          etapa({ ordem: 2, etapa: { nome: 'Ensaio' } }),
          etapa({ ordem: 3, etapa: { nome: 'Decisão' } }),
        ]),
      );

      expect(livro.worksheets.map((a) => a.name)).toEqual([
        'Visão geral',
        '1. Documental',
        '2. Ensaio',
        '3. Decisão',
        'Histórico',
      ]);
    });

    it('trunca o nome longo que o admin cadastrou', async () => {
      const longo =
        'Análise crítica da documentação técnica completa do processo';
      const livro = await gerarEReabrir(
        servico,
        detalhe([etapa({ ordem: 1, etapa: { nome: longo } })]),
      );

      const aba = livro.worksheets[1];
      expect(aba.name.length).toBe(31);
      expect(aba.name.startsWith('1. Análise crítica')).toBe(true);
    });

    it('desempata nomes iguais em vez de deixar o exceljs lançar', async () => {
      // Defensivo: hoje `ordem` é única por produto, então o prefixo já separa.
      // O teste existe para que a quebra dessa premissa apareça aqui.
      const livro = await gerarEReabrir(
        servico,
        detalhe([
          etapa({ ordem: 1, etapa: { nome: 'Ensaio' } }),
          etapa({ ordem: 1, etapa: { nome: 'Ensaio' } }),
          etapa({ ordem: 1, etapa: { nome: 'Ensaio' } }),
        ]),
      );

      const nomes = livro.worksheets.map((a) => a.name);
      expect(new Set(nomes).size).toBe(nomes.length);
      expect(nomes).toContain('1. Ensaio');
      expect(nomes).toContain('1. Ensaio(2)');
      expect(nomes).toContain('1. Ensaio(3)');
    });

    it('mantém a marca inteira quando o sufixo passa de um dígito', async () => {
      /*
       * Aqui a asserção NÃO pode ser só `length <= 31`: o exceljs trunca por
       * conta própria, então esse limite passaria mesmo com `nomeAba` gerando
       * 32 caracteres. O que denuncia o estouro é o parêntese de fechamento
       * sumindo — `(10` no lugar de `(10)` — a partir da décima colisão.
       */
      const nome = 'Análise documental completa do processo';
      const etapas = Array.from({ length: 12 }, () =>
        etapa({ ordem: 1, etapa: { nome } }),
      );

      const livro = await gerarEReabrir(servico, detalhe(etapas));
      const abas = livro.worksheets
        .map((a) => a.name)
        .filter((n) => n !== 'Visão geral' && n !== 'Histórico');

      expect(abas).toHaveLength(12);
      expect(new Set(abas).size).toBe(12);

      // 11 das 12 levam marca; a primeira fica sem.
      const comMarca = abas.filter((n) => /\(\d+\)$/.test(n));
      expect(comMarca).toHaveLength(11);
      for (const gerado of abas) {
        expect(gerado.length).toBeLessThanOrEqual(31);
      }
    });

    it('não empilha marcas em nome curto', async () => {
      // `1. Ensaio(2)(3)(4)` era o resultado de derivar cada tentativa do nome
      // anterior em vez da base.
      const etapas = Array.from({ length: 4 }, () =>
        etapa({ ordem: 1, etapa: { nome: 'Ensaio' } }),
      );

      const livro = await gerarEReabrir(servico, detalhe(etapas));
      const abas = livro.worksheets
        .map((a) => a.name)
        .filter((n) => n !== 'Visão geral' && n !== 'Histórico');

      expect(abas).toEqual([
        '1. Ensaio',
        '1. Ensaio(2)',
        '1. Ensaio(3)',
        '1. Ensaio(4)',
      ]);
    });
  });

  // --------------------------------------------------------------- datas

  describe('datas', () => {
    it('grava Date de verdade com numFmt — é o que faz o autofiltro ordenar', async () => {
      const atualizadoEm = new Date('2026-03-10T14:05:00Z');
      const livro = await gerarEReabrir(
        servico,
        detalhe([etapa({ ordem: 1, atualizadoEm })]),
      );

      const visao = livro.worksheets[0];
      const cabecalho = linhaComRotulo(visao, 'Ordem');
      expect(cabecalho).not.toBeNull();

      const celula = visao.getRow(cabecalho! + 1).getCell(8);
      expect(celula.value).toBeInstanceOf(Date);
      expect((celula.value as Date).toISOString()).toBe(
        atualizadoEm.toISOString(),
      );
      expect(celula.numFmt).toBe('dd/mm/yyyy hh:mm');
    });

    it('formata também as datas do bloco chave/valor da etapa', async () => {
      const livro = await gerarEReabrir(
        servico,
        detalhe([
          etapa({ ordem: 1, atualizadoEm: new Date('2026-03-10T14:05:00Z') }),
        ]),
      );

      const aba = livro.worksheets[1];
      const linha = linhaComRotulo(aba, 'Atualizado em');
      expect(linha).not.toBeNull();

      const celula = aba.getRow(linha!).getCell(2);
      expect(celula.value).toBeInstanceOf(Date);
      expect(celula.numFmt).toBe('dd/mm/yyyy hh:mm');
    });

    it('define autofiltro sobre a tabela de etapas', async () => {
      const livro = await gerarEReabrir(
        servico,
        detalhe([
          etapa({ ordem: 1, etapa: { nome: 'A' } }),
          etapa({ ordem: 2, etapa: { nome: 'B' } }),
        ]),
      );

      expect(livro.worksheets[0].autoFilter).toBeTruthy();
    });
  });

  // ----------------------------------------------------------- histórico

  describe('aba de histórico', () => {
    it('intercala as etapas em ordem cronológica decrescente', async () => {
      const livro = await gerarEReabrir(
        servico,
        detalhe([
          etapa({
            ordem: 1,
            etapa: { nome: 'Documental' },
            historico: [
              historico({ alteradoEm: new Date('2026-03-01T10:00:00Z') }),
              historico({ alteradoEm: new Date('2026-03-05T10:00:00Z') }),
            ],
          }),
          etapa({
            ordem: 2,
            etapa: { nome: 'Ensaio' },
            historico: [
              historico({ alteradoEm: new Date('2026-03-03T10:00:00Z') }),
            ],
          }),
        ]),
      );

      const aba = livro.worksheets[livro.worksheets.length - 1];
      expect(aba.name).toBe('Histórico');

      const cabecalho = linhaComRotulo(aba, 'Data')!;
      const datas: string[] = [];
      for (let i = cabecalho + 1; i <= cabecalho + 3; i++) {
        datas.push((aba.getRow(i).getCell(1).value as Date).toISOString());
      }

      expect(datas).toEqual([
        '2026-03-05T10:00:00.000Z',
        '2026-03-03T10:00:00.000Z',
        '2026-03-01T10:00:00.000Z',
      ]);
    });

    it('conta as evidências do histórico na coluna própria', async () => {
      const livro = await gerarEReabrir(
        servico,
        detalhe([
          etapa({
            ordem: 1,
            historico: [
              historico({ documentos: [documento(), documento()] }),
            ],
          }),
        ]),
      );

      const aba = livro.worksheets[livro.worksheets.length - 1];
      const cabecalho = linhaComRotulo(aba, 'Data')!;
      expect(aba.getRow(cabecalho + 1).getCell(8).value).toBe(2);
    });

    it('não quebra quando não há nenhuma alteração registrada', async () => {
      const livro = await gerarEReabrir(servico, detalhe([etapa({ ordem: 1 })]));
      const aba = livro.worksheets[livro.worksheets.length - 1];
      expect(
        linhaComRotulo(aba, 'Nenhuma alteração registrada até agora.'),
      ).not.toBeNull();
    });
  });

  // ----------------------------------------------------------------- CSV

  describe('csv', () => {
    it('começa com BOM de UTF-8 — sem ele o Excel do Windows abre em ANSI', () => {
      const texto = servico.csv(detalhe([etapa()]), 'Ana Técnica');
      expect(texto.charCodeAt(0)).toBe(0xfeff);
    });

    it('separa por ponto e vírgula, não por vírgula', () => {
      const texto = servico.csv(
        detalhe([etapa({ ordem: 1, etapa: { nome: 'Ensaio' } })]),
        'Ana Técnica',
      );
      expect(texto).toContain('Produto;Disjuntor DIN 25A');
    });

    it('envelopa o valor que contém o separador, aspas ou quebra de linha', () => {
      const texto = servico.csv(
        detalhe([
          etapa({
            ordem: 1,
            observacao: 'Reprovado; ver o item "3.2"\nreensaiar.',
          }),
        ]),
        'Ana Técnica',
      );

      expect(texto).toContain('"Reprovado; ver o item ""3.2""\nreensaiar."');
    });

    it('escreve as datas em pt-BR e o nulo como travessão', () => {
      const texto = servico.csv(
        detalhe([
          etapa({
            ordem: 1,
            naoConformidades: [
              naoConformidade({
                criadoEm: new Date('2026-03-11T12:00:00Z'),
                resolvidoEm: null,
              }),
            ],
          }),
        ]),
        'Ana Técnica',
      );

      // `toLocaleString('pt-BR')` separa data e hora por vírgula, não espaço.
      // A vírgula é inofensiva aqui justamente porque o separador é `;`.
      expect(texto).toMatch(/\d{2}\/\d{2}\/2026, \d{2}:\d{2}/);
      expect(texto).toContain('NC-2026-000001');
      expect(texto).toContain('—');
    });

    it('termina em CRLF', () => {
      const texto = servico.csv(detalhe([etapa()]), 'Ana Técnica');
      expect(texto.endsWith('\r\n')).toBe(true);
    });
  });

  // --------------------------------------------------------- nomeArquivo

  describe('nomeArquivo', () => {
    it('tira acento e espaço — o Content-Disposition é ASCII', () => {
      const nome = servico.nomeArquivo(
        detalhe([], { produto: produtoFixo('Disjuntor Térmico Ação') }),
        'xlsx',
      );
      expect(nome).toMatch(
        /^acompanhamento-disjuntor-termico-acao-\d{4}-\d{2}-\d{2}\.xlsx$/,
      );
    });

    it('cai no rótulo genérico quando o nome não tem nenhum alfanumérico', () => {
      const nome = servico.nomeArquivo(
        detalhe([], { produto: produtoFixo('—— ///') }),
        'csv',
      );
      expect(nome).toMatch(/^acompanhamento-produto-\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('limita a base a 60 caracteres', () => {
      const nome = servico.nomeArquivo(
        detalhe([], { produto: produtoFixo('A'.repeat(120)) }),
        'xlsx',
      );
      const base = nome
        .replace(/^acompanhamento-/, '')
        .replace(/-\d{4}-\d{2}-\d{2}\.xlsx$/, '');
      expect(base.length).toBe(60);
    });
  });
});
