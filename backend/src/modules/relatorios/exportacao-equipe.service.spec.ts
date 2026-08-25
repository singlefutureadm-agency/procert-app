import { Workbook } from 'exceljs';

import { ExportacaoEquipeService } from './exportacao-equipe.service';
import type { LinhaEquipe } from './equipe.service';

/**
 * Como em `exportacao.service.spec.ts`, o XLSX é **gerado e relido** — é a
 * releitura do buffer que prova que o Excel aceitaria o arquivo. O e2e baixa o
 * arquivo e não o abre, então nenhuma destas regras é alcançável por teste de
 * rota.
 */

const PERIODO = { de: '2026-01-01', ate: '2026-01-31' };

function linha(sobrescreve: Partial<LinhaEquipe> = {}): LinhaEquipe {
  return {
    id: 1,
    nome: 'Ana Administradora',
    email: 'ana@procertocp.com.br',
    role: 'ADMIN',
    status: 'ATIVO',
    ultimoAcessoEm: new Date('2026-01-20T14:30:00Z'),
    carteira: { clientes: 4 },
    atividade: {
      etapasAvaliadas: 12,
      aprovacoes: 9,
      reprovacoes: 3,
      ncsAbertas: 2,
      certificadosEmitidos: 1,
      documentosEnviados: 5,
      ultimaMovimentacao: new Date('2026-01-28T09:15:00Z'),
    },
    ...sobrescreve,
  } as LinhaEquipe;
}

async function gerarEReabrir(
  servico: ExportacaoEquipeService,
  linhas: LinhaEquipe[],
): Promise<Workbook> {
  const buffer = await servico.xlsx(linhas, PERIODO, 'Ana Administradora');
  const livro = new Workbook();
  await livro.xlsx.load(buffer as unknown as ArrayBuffer);
  return livro;
}

describe('ExportacaoEquipeService', () => {
  let servico: ExportacaoEquipeService;

  beforeEach(() => {
    servico = new ExportacaoEquipeService();
  });

  describe('xlsx', () => {
    it('gera um arquivo que o exceljs relê', async () => {
      const livro = await gerarEReabrir(servico, [linha()]);
      expect(livro.worksheets).toHaveLength(1);
      expect(livro.worksheets[0].name).toBe('Desempenho da equipe');
    });

    it('grava as datas como Date com numFmt — é o que faz o autofiltro ordenar', async () => {
      const livro = await gerarEReabrir(servico, [linha()]);
      const aba = livro.worksheets[0];

      let encontrou = 0;
      aba.eachRow((l) =>
        l.eachCell((celula) => {
          if (celula.value instanceof Date) {
            expect(celula.numFmt).toBe('dd/mm/yyyy hh:mm');
            encontrou += 1;
          }
        }),
      );

      // "Gerado em" + última movimentação + último acesso.
      expect(encontrou).toBeGreaterThanOrEqual(3);
    });

    it('define autofiltro sobre a tabela', async () => {
      const livro = await gerarEReabrir(servico, [linha(), linha({ id: 2 })]);
      expect(livro.worksheets[0].autoFilter).toBeTruthy();
    });

    it('avisa, dentro do arquivo, que a carteira ignora o período', async () => {
      const livro = await gerarEReabrir(servico, [linha()]);

      const textos: string[] = [];
      livro.worksheets[0].eachRow((l) =>
        l.eachCell((celula) => {
          if (typeof celula.value === 'string') textos.push(celula.value);
        }),
      );

      // A planilha sai da tela e circula sozinha por e-mail: sem este aviso,
      // quem abre o arquivo lê a carteira como se fosse do período.
      expect(textos.join(' ')).toMatch(/carteira.*NÃO respeita o período/i);
    });

    it('não quebra quando não há colaborador nenhum', async () => {
      const livro = await gerarEReabrir(servico, []);
      expect(livro.worksheets).toHaveLength(1);
    });

    it('mantém carteira e atividade em colunas distintas, sem total somado', async () => {
      const livro = await gerarEReabrir(servico, [linha()]);
      const aba = livro.worksheets[0];

      const cabecalhos: string[] = [];
      aba.eachRow((l) => {
        const primeira = l.getCell(1).value;
        if (primeira === 'Colaborador') {
          l.eachCell((celula) => cabecalhos.push(String(celula.value)));
        }
      });

      expect(cabecalhos).toContain('Clientes na carteira (hoje)');
      expect(cabecalhos).toContain('Etapas avaliadas');
      // Nada que combine os dois: somar carteira com atividade não significa nada.
      expect(cabecalhos.join(' ')).not.toMatch(/total geral|pontua|score/i);
    });
  });

  describe('csv', () => {
    it('começa com BOM de UTF-8 — sem ele o Excel do Windows abre em ANSI', () => {
      const texto = servico.csv([linha()], PERIODO, 'Ana Administradora');
      expect(texto.charCodeAt(0)).toBe(0xfeff);
    });

    it('separa por ponto e vírgula, não por vírgula', () => {
      const texto = servico.csv([linha()], PERIODO, 'Ana Administradora');
      expect(texto).toContain('Colaborador;E-mail;');
    });

    it('envelopa o valor que contém o separador', () => {
      const texto = servico.csv(
        [linha({ nome: 'Silva; Souza e Cia' })],
        PERIODO,
        'Ana Administradora',
      );
      expect(texto).toContain('"Silva; Souza e Cia"');
    });

    it('carrega o mesmo aviso sobre a carteira', () => {
      const texto = servico.csv([linha()], PERIODO, 'Ana Administradora');
      expect(texto).toMatch(/NAO respeita o período/i);
    });
  });

  describe('nomeArquivo', () => {
    it('traz o período e a extensão', () => {
      expect(servico.nomeArquivo(PERIODO, 'xlsx')).toBe(
        'desempenho-equipe-2026-01-01-a-2026-01-31.xlsx',
      );
      expect(servico.nomeArquivo(PERIODO, 'csv')).toBe(
        'desempenho-equipe-2026-01-01-a-2026-01-31.csv',
      );
    });

    it('sai sem caractere fora de ASCII — o Content-Disposition não os aceita', () => {
      const nome = servico.nomeArquivo(
        { de: '2026-01-01T00:00:00Z', ate: '2026-01-31T23:59:59Z' },
        'xlsx',
      );
      expect(nome).toMatch(/^[\x20-\x7e]+$/);
    });
  });
});
