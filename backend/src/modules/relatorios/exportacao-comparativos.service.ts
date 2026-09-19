import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';

import {
  blocoChaveValor,
  bufferDoLivro,
  dataBR,
  fecharCsv,
  linhaCsv,
  nomeAbaSeguro,
  tabela,
  titulo,
  vazio,
} from '../../common/planilha/planilha.util';
import type { LinhaCliente, LinhaProcesso } from './comparativos.service';

/**
 * Planilhas dos comparativos de processos e de clientes.
 *
 * Reaproveita `common/planilha`, como as demais exportações: data como `Date`
 * com `numFmt`, BOM de UTF-8, separador `;` e saneamento de nome de aba não são
 * reescritos aqui.
 */

const CABECALHOS_PROCESSO = [
  'Processo',
  'Cliente',
  'Categoria',
  'Versão da trilha',
  'Progresso (%)',
  'Etapas aprovadas',
  'Total de etapas',
  'Reprovadas',
  'Pendentes',
  'Obrigatórias pendentes',
  'NCs abertas',
  'Última movimentação',
  'Dias parado',
  'Cadastrado em',
];

const CABECALHOS_CLIENTE = [
  'Cliente',
  'E-mail',
  'Responsável pela carteira',
  'Processos',
  'Processos concluídos',
  'Certificados vigentes',
  'NCs abertas',
  'Última movimentação',
  'Último acesso da conta',
];

@Injectable()
export class ExportacaoComparativosService {
  async processosXlsx(
    linhas: LinhaProcesso[],
    geradoPor: string,
  ): Promise<Buffer> {
    const livro = new Workbook();
    livro.creator = 'ProCert';
    livro.created = new Date();

    const aba = livro.addWorksheet(
      nomeAbaSeguro('Comparativo de processos', new Set()),
    );

    titulo(aba, 'COMPARATIVO DE PROCESSOS');
    blocoChaveValor(aba, [
      ['Processos no recorte', linhas.length],
      ['Gerado por', geradoPor],
      ['Gerado em', new Date()],
    ]);
    aba.addRow([]);

    vazio(
      aba,
      'Progresso é sobre TODAS as etapas da trilha. "Obrigatórias pendentes" é o que ' +
        'realmente trava a emissão do certificado — etapa opcional pendente não bloqueia.',
    );
    aba.addRow([]);

    if (linhas.length === 0) {
      vazio(aba, 'Nenhum processo no recorte.');
    } else {
      tabela(
        aba,
        CABECALHOS_PROCESSO,
        linhas.map((l) => [
          l.nome,
          l.cliente,
          l.categoria,
          l.trilhaVersao,
          l.progresso,
          l.aprovadas,
          l.totalEtapas,
          l.reprovadas,
          l.pendentes,
          l.obrigatoriasPendentes,
          l.ncsAbertas,
          l.ultimaMovimentacao,
          l.diasParado,
          l.criadoEm,
        ]),
      );
    }

    aba.columns.forEach((coluna, indice) => {
      coluna.width = indice <= 2 ? 32 : 16;
    });

    return bufferDoLivro(livro);
  }

  processosCsv(linhas: LinhaProcesso[], geradoPor: string): string {
    const secoes: string[][][] = [
      [
        ['COMPARATIVO DE PROCESSOS'],
        ['Processos no recorte', String(linhas.length)],
        ['Gerado por', geradoPor],
        ['Gerado em', dataBR(new Date())],
        [
          'Nota',
          'Progresso e sobre TODAS as etapas; "Obrigatorias pendentes" e o que trava o certificado.',
        ],
      ],
      [
        CABECALHOS_PROCESSO,
        ...linhas.map((l) => [
          l.nome,
          l.cliente,
          l.categoria,
          String(l.trilhaVersao),
          String(l.progresso),
          String(l.aprovadas),
          String(l.totalEtapas),
          String(l.reprovadas),
          String(l.pendentes),
          String(l.obrigatoriasPendentes),
          String(l.ncsAbertas),
          dataBR(l.ultimaMovimentacao),
          l.diasParado === null ? '—' : String(l.diasParado),
          dataBR(l.criadoEm),
        ]),
      ],
    ];

    return fecharCsv(this.juntar(secoes));
  }

  async clientesXlsx(
    linhas: LinhaCliente[],
    geradoPor: string,
  ): Promise<Buffer> {
    const livro = new Workbook();
    livro.creator = 'ProCert';
    livro.created = new Date();

    const aba = livro.addWorksheet(
      nomeAbaSeguro('Comparativo de clientes', new Set()),
    );

    titulo(aba, 'COMPARATIVO DE CLIENTES');
    blocoChaveValor(aba, [
      ['Clientes no recorte', linhas.length],
      ['Gerado por', geradoPor],
      ['Gerado em', new Date()],
    ]);
    aba.addRow([]);

    vazio(
      aba,
      'Concluído = todas as etapas obrigatórias aprovadas. Certificados vigentes conta ' +
        'apenas EMITIDO e SUSPENSO — cancelado e vencido ficam de fora.',
    );
    aba.addRow([]);

    if (linhas.length === 0) {
      vazio(aba, 'Nenhum cliente no recorte.');
    } else {
      tabela(
        aba,
        CABECALHOS_CLIENTE,
        linhas.map((l) => [
          l.nome,
          l.email,
          l.responsavel,
          l.processos,
          l.processosConcluidos,
          l.certificadosVigentes,
          l.ncsAbertas,
          l.ultimaMovimentacao,
          l.ultimoAcessoEm,
        ]),
      );
    }

    aba.columns.forEach((coluna, indice) => {
      coluna.width = indice <= 2 ? 32 : 18;
    });

    return bufferDoLivro(livro);
  }

  clientesCsv(linhas: LinhaCliente[], geradoPor: string): string {
    const secoes: string[][][] = [
      [
        ['COMPARATIVO DE CLIENTES'],
        ['Clientes no recorte', String(linhas.length)],
        ['Gerado por', geradoPor],
        ['Gerado em', dataBR(new Date())],
        [
          'Nota',
          'Concluido = todas as etapas obrigatorias aprovadas. Vigentes = EMITIDO ou SUSPENSO.',
        ],
      ],
      [
        CABECALHOS_CLIENTE,
        ...linhas.map((l) => [
          l.nome,
          l.email,
          l.responsavel ?? '—',
          String(l.processos),
          String(l.processosConcluidos),
          String(l.certificadosVigentes),
          String(l.ncsAbertas),
          dataBR(l.ultimaMovimentacao),
          dataBR(l.ultimoAcessoEm),
        ]),
      ],
    ];

    return fecharCsv(this.juntar(secoes));
  }

  nomeArquivo(qual: 'processos' | 'clientes', extensao: 'xlsx' | 'csv'): string {
    const dia = new Date().toISOString().slice(0, 10);
    return `comparativo-${qual}-${dia}.${extensao}`;
  }

  private juntar(secoes: string[][][]): string {
    return secoes
      .map((bloco) => bloco.map((celulas) => linhaCsv(celulas)).join('\r\n'))
      .join('\r\n\r\n');
  }
}
