import { Workbook } from 'exceljs';

import { ExportacaoComparativosService } from './exportacao-comparativos.service';
import type { LinhaCliente, LinhaProduto } from './comparativos.service';

/**
 * Gera e **relê** o buffer, como as demais suítes de exportação: é a releitura
 * que prova que o Excel aceitaria o arquivo. O e2e baixa e não abre.
 */

function produto(sobrescreve: Partial<LinhaProduto> = {}): LinhaProduto {
  return {
    id: 1,
    nome: 'Disjuntor DIN 25A',
    clienteId: 10,
    cliente: 'Indústria Cliente Ltda',
    categoria: 'Material elétrico',
    trilhaVersao: 2,
    totalEtapas: 5,
    aprovadas: 3,
    reprovadas: 1,
    pendentes: 1,
    obrigatoriasPendentes: 2,
    ncsAbertas: 1,
    progresso: 60,
    ultimaMovimentacao: new Date('2026-06-10T13:00:00Z'),
    diasParado: 76,
    criadoEm: new Date('2026-01-15T09:00:00Z'),
    ...sobrescreve,
  };
}

function cliente(sobrescreve: Partial<LinhaCliente> = {}): LinhaCliente {
  return {
    id: 10,
    nome: 'Indústria Cliente Ltda',
    email: 'contato@cliente.com.br',
    responsavel: 'Bruno Analista',
    ultimoAcessoEm: new Date('2026-08-01T10:00:00Z'),
    produtos: 4,
    produtosConcluidos: 2,
    certificadosVigentes: 2,
    ncsAbertas: 1,
    ultimaMovimentacao: new Date('2026-08-20T16:00:00Z'),
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
  return textos.join(' ');
}

describe('ExportacaoComparativosService', () => {
  let servico: ExportacaoComparativosService;

  beforeEach(() => {
    servico = new ExportacaoComparativosService();
  });

  describe('produtos — XLSX', () => {
    it('gera um arquivo que o exceljs relê', async () => {
      const livro = await reabrir(
        await servico.produtosXlsx([produto()], 'Ana Administradora'),
      );
      expect(livro.worksheets).toHaveLength(1);
      expect(livro.worksheets[0].name).toBe('Comparativo de produtos');
    });

    it('grava as datas como Date com numFmt', async () => {
      const livro = await reabrir(
        await servico.produtosXlsx([produto()], 'Ana Administradora'),
      );

      let datas = 0;
      livro.worksheets[0].eachRow((l) =>
        l.eachCell((c) => {
          if (c.value instanceof Date) {
            expect(c.numFmt).toBe('dd/mm/yyyy hh:mm');
            datas += 1;
          }
        }),
      );

      // "Gerado em" + última movimentação + cadastrado em.
      expect(datas).toBeGreaterThanOrEqual(3);
    });

    it('distingue "obrigatórias pendentes" de "pendentes" nas colunas', async () => {
      const livro = await reabrir(
        await servico.produtosXlsx([produto()], 'Ana Administradora'),
      );

      const cabecalhos: string[] = [];
      livro.worksheets[0].eachRow((l) => {
        if (l.getCell(1).value === 'Produto') {
          l.eachCell((c) => cabecalhos.push(String(c.value)));
        }
      });

      // São coisas diferentes: só a obrigatória trava o certificado. Fundi-las
      // faria a planilha afirmar que um produto pode emitir quando não pode.
      expect(cabecalhos).toContain('Pendentes');
      expect(cabecalhos).toContain('Obrigatórias pendentes');
    });

    it('avisa, dentro do arquivo, o que trava o certificado', async () => {
      const livro = await reabrir(
        await servico.produtosXlsx([produto()], 'Ana Administradora'),
      );
      expect(textosDe(livro)).toMatch(/opcional pendente não bloqueia/i);
    });

    it('não quebra com recorte vazio', async () => {
      const livro = await reabrir(
        await servico.produtosXlsx([], 'Ana Administradora'),
      );
      expect(livro.worksheets).toHaveLength(1);
    });
  });

  describe('clientes — XLSX', () => {
    it('gera um arquivo que o exceljs relê', async () => {
      const livro = await reabrir(
        await servico.clientesXlsx([cliente()], 'Ana Administradora'),
      );
      expect(livro.worksheets[0].name).toBe('Comparativo de clientes');
    });

    it('declara as definições de "concluído" e "vigente"', async () => {
      const livro = await reabrir(
        await servico.clientesXlsx([cliente()], 'Ana Administradora'),
      );
      const textos = textosDe(livro);

      // O arquivo circula por e-mail longe do rodapé da tela.
      expect(textos).toMatch(/etapas obrigatórias aprovadas/i);
      expect(textos).toMatch(/EMITIDO e SUSPENSO/);
    });

    it('mantém o responsável nulo legível', async () => {
      const livro = await reabrir(
        await servico.clientesXlsx(
          [cliente({ responsavel: null })],
          'Ana Administradora',
        ),
      );
      expect(textosDe(livro)).toContain('—');
    });
  });

  describe('CSV', () => {
    it('produtos: BOM de UTF-8 e separador ponto e vírgula', () => {
      const texto = servico.produtosCsv([produto()], 'Ana Administradora');
      expect(texto.charCodeAt(0)).toBe(0xfeff);
      expect(texto).toContain('Produto;Cliente;');
    });

    it('clientes: BOM de UTF-8 e separador ponto e vírgula', () => {
      const texto = servico.clientesCsv([cliente()], 'Ana Administradora');
      expect(texto.charCodeAt(0)).toBe(0xfeff);
      expect(texto).toContain('Cliente;E-mail;');
    });

    it('envelopa o valor que contém o separador', () => {
      const texto = servico.produtosCsv(
        [produto({ cliente: 'Silva; Souza e Cia' })],
        'Ana Administradora',
      );
      expect(texto).toContain('"Silva; Souza e Cia"');
    });

    it('produto sem movimentação sai como travessão, não como vazio', () => {
      const texto = servico.produtosCsv(
        [produto({ diasParado: null, ultimaMovimentacao: null })],
        'Ana Administradora',
      );
      // Célula vazia no meio da linha vira coluna deslocada na leitura manual.
      expect(texto).toContain('—');
    });
  });

  describe('nomeArquivo', () => {
    it('nomeia por tipo e data, em ASCII', () => {
      const nome = servico.nomeArquivo('produtos', 'xlsx');
      expect(nome).toMatch(/^comparativo-produtos-\d{4}-\d{2}-\d{2}\.xlsx$/);
      expect(nome).toMatch(/^[\x20-\x7e]+$/);

      expect(servico.nomeArquivo('clientes', 'csv')).toMatch(
        /^comparativo-clientes-\d{4}-\d{2}-\d{2}\.csv$/,
      );
    });
  });
});
