import { Workbook } from 'exceljs';

import { ExportacaoCicloService } from './exportacao-ciclo.service';
import type { RelatorioCiclo } from './ciclo.service';

/**
 * Gera e relê o buffer, como as demais suítes de exportação.
 *
 * O foco aqui é a **nomenclatura**: a planilha circula por e-mail longe do
 * rodapé da tela, e é onde ninguém consegue conferir a definição de um número.
 * Se um rótulo genérico como "tempo da etapa" escapar para cá, a pergunta "qual
 * relógio é esse?" fica sem resposta.
 */

function relatorio(sobrescreve: Partial<RelatorioCiclo> = {}): RelatorioCiclo {
  return {
    agrupamento: 'trilha',
    periodo: { de: '2026-01-01', ate: '2026-06-30' },
    grupos: [
      {
        chave: 'Material elétrico · v2',
        leadTimeTrilha: { medianaDias: 87.5, base: 12 },
        tempoTratamentoEtapa: { medianaDias: 9.2, base: 40 },
        tempoEmFila: { medianaDias: 3.1, base: 44 },
        aprovacaoDireta: { etapas: 5 },
        etapasEmAberto: { etapas: 7, medianaDias: 21.4 },
      },
    ],
    ...sobrescreve,
  };
}

async function reabrir(buffer: Buffer): Promise<Workbook> {
  const livro = new Workbook();
  await livro.xlsx.load(buffer as unknown as ArrayBuffer);
  return livro;
}

function textosDe(livro: Workbook): string {
  const textos: string[] = [];
  livro.worksheets[0].eachRow((l) =>
    l.eachCell((c) => {
      if (typeof c.value === 'string') textos.push(c.value);
    }),
  );
  return textos.join(' | ');
}

function cabecalhosDe(livro: Workbook): string[] {
  const cabecalhos: string[] = [];
  livro.worksheets[0].eachRow((l) => {
    if (l.getCell(1).value === 'Trilha / Etapa') {
      l.eachCell((c) => cabecalhos.push(String(c.value)));
    }
  });
  return cabecalhos;
}

describe('ExportacaoCicloService', () => {
  let servico: ExportacaoCicloService;

  beforeEach(() => {
    servico = new ExportacaoCicloService();
  });

  describe('nomenclatura', () => {
    it('usa os cinco rótulos combinados, palavra por palavra', async () => {
      const livro = await reabrir(
        await servico.xlsx(relatorio(), 'Ana Administradora'),
      );
      const cabecalhos = cabecalhosDe(livro);

      expect(cabecalhos).toContain('Lead time da trilha (dias)');
      expect(cabecalhos).toContain('Tempo de tratamento da etapa (dias)');
      expect(cabecalhos).toContain('Tempo em fila (dias)');
      expect(cabecalhos).toContain('Aprovação direta (etapas)');
      expect(cabecalhos).toContain('Etapas em aberto');
    });

    it('NÃO usa "tempo da etapa" genérico em lugar nenhum', async () => {
      const livro = await reabrir(
        await servico.xlsx(relatorio(), 'Ana Administradora'),
      );

      /*
       * Três relógios diferentes cabem embaixo desse nome. Se ele aparecer,
       * "por que essa etapa demorou 14 dias?" deixa de ter resposta a partir
       * do próprio arquivo.
       */
      expect(textosDe(livro)).not.toMatch(/tempo da etapa/i);
    });

    it('cada duração leva a base ao lado', async () => {
      const cabecalhos = cabecalhosDe(
        await reabrir(await servico.xlsx(relatorio(), 'Ana Administradora')),
      );

      // Mediana sem base não diz se veio de 40 etapas ou de uma.
      expect(cabecalhos).toContain('Lead time — base (produtos)');
      expect(cabecalhos).toContain('Tratamento — base (etapas)');
      expect(cabecalhos).toContain('Fila — base (etapas)');
    });

    it('carrega as definições dentro do arquivo', async () => {
      const textos = textosDe(
        await reabrir(await servico.xlsx(relatorio(), 'Ana Administradora')),
      );

      expect(textos).toMatch(/NÃO comparáveis entre si/i);
      expect(textos).toMatch(/medianas, nunca médias/i);
      expect(textos).toMatch(/ficam FORA da mediana de tratamento/i);
    });
  });

  describe('xlsx', () => {
    it('gera um arquivo que o exceljs relê', async () => {
      const livro = await reabrir(
        await servico.xlsx(relatorio(), 'Ana Administradora'),
      );
      expect(livro.worksheets).toHaveLength(1);
      expect(livro.worksheets[0].name).toBe('Tempo de ciclo');
    });

    it('grava a mediana como número, não como texto', async () => {
      const livro = await reabrir(
        await servico.xlsx(relatorio(), 'Ana Administradora'),
      );

      const valores: unknown[] = [];
      livro.worksheets[0].eachRow((l) => {
        if (l.getCell(1).value === 'Material elétrico · v2') {
          l.eachCell((c) => valores.push(c.value));
        }
      });

      // Como texto, o Excel não soma, não ordena e não faz média da coluna.
      expect(valores).toContain(87.5);
      expect(valores).toContain(9.2);
    });

    it('mediana nula sai como célula vazia, e não como zero', async () => {
      const livro = await reabrir(
        await servico.xlsx(
          relatorio({
            grupos: [
              {
                chave: 'Sem dados · v1',
                leadTimeTrilha: { medianaDias: null, base: 0 },
                tempoTratamentoEtapa: { medianaDias: null, base: 0 },
                tempoEmFila: { medianaDias: null, base: 0 },
                aprovacaoDireta: { etapas: 0 },
                etapasEmAberto: { etapas: 0, medianaDias: null },
              },
            ],
          }),
          'Ana Administradora',
        ),
      );

      // Zero afirmaria "levou zero dia"; base vazia significa "não medimos".
      const valores: unknown[] = [];
      livro.worksheets[0].eachRow((l) => {
        if (l.getCell(1).value === 'Sem dados · v1') {
          l.eachCell((c) => valores.push(c.value));
        }
      });
      expect(valores).toContain('—');
    });

    it('não quebra com recorte vazio', async () => {
      const livro = await reabrir(
        await servico.xlsx(relatorio({ grupos: [] }), 'Ana Administradora'),
      );
      expect(livro.worksheets).toHaveLength(1);
    });
  });

  describe('csv', () => {
    it('começa com BOM de UTF-8 e separa por ponto e vírgula', () => {
      const texto = servico.csv(relatorio(), 'Ana Administradora');
      expect(texto.charCodeAt(0)).toBe(0xfeff);
      expect(texto).toContain('Trilha / Etapa;');
    });

    it('escreve o decimal com VÍRGULA — o separador de coluna é ponto e vírgula', () => {
      const texto = servico.csv(relatorio(), 'Ana Administradora');

      /*
       * No Excel em português a vírgula é o separador decimal. Com ponto,
       * `87.5` entra como texto e não participa de conta nenhuma — e é por
       * isso que o separador de coluna aqui é `;`.
       */
      expect(texto).toContain('87,5');
      expect(texto).not.toContain('87.5');
    });

    it('leva as definições junto', () => {
      const texto = servico.csv(relatorio(), 'Ana Administradora');
      expect(texto).toMatch(/Lead time da trilha/);
      expect(texto).toMatch(/Tempo em fila/);
    });
  });

  describe('nomeArquivo', () => {
    it('diz o agrupamento no nome, em ASCII', () => {
      expect(servico.nomeArquivo('trilha', 'xlsx')).toMatch(
        /^tempo-de-ciclo-por-trilha-\d{4}-\d{2}-\d{2}\.xlsx$/,
      );
      expect(servico.nomeArquivo('etapa', 'csv')).toMatch(
        /^tempo-de-ciclo-por-etapa-\d{4}-\d{2}-\d{2}\.csv$/,
      );
      expect(servico.nomeArquivo('trilha', 'xlsx')).toMatch(/^[\x20-\x7e]+$/);
    });
  });
});
