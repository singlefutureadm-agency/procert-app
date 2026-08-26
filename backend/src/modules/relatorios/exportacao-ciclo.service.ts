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
import type { RelatorioCiclo } from './ciclo.service';

/**
 * Planilha do tempo de ciclo.
 *
 * **Os rótulos aqui são os mesmos da tela e das chaves da API**, palavra por
 * palavra. A planilha circula por e-mail longe do rodapé da tela, então cada
 * coluna carrega o nome do relógio que mede — e a base, logo ao lado. Coluna de
 * duração sem base não diz se a mediana veio de 40 etapas ou de uma.
 *
 * Não existe coluna "tempo da etapa": três relógios diferentes cabem embaixo
 * desse nome, e a planilha é justamente onde ninguém pode conferir a definição.
 */

const CABECALHOS = [
  'Trilha / Etapa',
  'Lead time da trilha (dias)',
  'Lead time — base (produtos)',
  'Tempo de tratamento da etapa (dias)',
  'Tratamento — base (etapas)',
  'Tempo em fila (dias)',
  'Fila — base (etapas)',
  'Aprovação direta (etapas)',
  'Etapas em aberto',
  'Etapas em aberto — mediana (dias)',
];

const NOTA_METRICAS =
  'Três medidas diferentes, NÃO comparáveis entre si. ' +
  'Lead time da trilha: da submissão do produto até a aprovação da última etapa obrigatória. ' +
  'Tempo de tratamento da etapa: da primeira saída de Pendente até a aprovação. ' +
  'Tempo em fila: da criação da etapa até alguém encostar nela. ' +
  'Aprovação direta: etapas que foram de Pendente a Aprovado sem tratamento registrado — ' +
  'ficam FORA da mediana de tratamento. ' +
  'Etapas em aberto: ainda não aprovadas, medidas até hoje, fora das demais medianas. ' +
  'Todas as medianas, nunca médias.';

@Injectable()
export class ExportacaoCicloService {
  async xlsx(relatorio: RelatorioCiclo, geradoPor: string): Promise<Buffer> {
    const livro = new Workbook();
    livro.creator = 'ProCert';
    livro.created = new Date();

    const aba = livro.addWorksheet(
      nomeAbaSeguro('Tempo de ciclo', new Set()),
    );

    titulo(aba, 'TEMPO DE CICLO');
    blocoChaveValor(aba, [
      [
        'Agrupamento',
        relatorio.agrupamento === 'trilha'
          ? 'Por trilha (categoria + versão)'
          : 'Por etapa (nome)',
      ],
      [
        'Período de submissão',
        relatorio.periodo.de || relatorio.periodo.ate
          ? `${dataBR(relatorio.periodo.de)} a ${dataBR(relatorio.periodo.ate)}`
          : 'Sem recorte',
      ],
      ['Grupos', relatorio.grupos.length],
      ['Gerado por', geradoPor],
      ['Gerado em', new Date()],
    ]);
    aba.addRow([]);

    vazio(aba, NOTA_METRICAS);
    aba.addRow([]);

    if (relatorio.grupos.length === 0) {
      vazio(aba, 'Nenhum grupo no recorte.');
    } else {
      tabela(
        aba,
        CABECALHOS,
        relatorio.grupos.map((g) => [
          g.chave,
          g.leadTimeTrilha?.medianaDias ?? null,
          g.leadTimeTrilha?.base ?? null,
          g.tempoTratamentoEtapa.medianaDias,
          g.tempoTratamentoEtapa.base,
          g.tempoEmFila.medianaDias,
          g.tempoEmFila.base,
          g.aprovacaoDireta.etapas,
          g.etapasEmAberto.etapas,
          g.etapasEmAberto.medianaDias,
        ]),
      );
    }

    aba.columns.forEach((coluna, indice) => {
      coluna.width = indice === 0 ? 38 : 22;
    });

    return bufferDoLivro(livro);
  }

  csv(relatorio: RelatorioCiclo, geradoPor: string): string {
    const secoes: string[][][] = [
      [
        ['TEMPO DE CICLO'],
        [
          'Agrupamento',
          relatorio.agrupamento === 'trilha'
            ? 'Por trilha (categoria + versao)'
            : 'Por etapa (nome)',
        ],
        [
          'Periodo de submissao',
          relatorio.periodo.de || relatorio.periodo.ate
            ? `${dataBR(relatorio.periodo.de)} a ${dataBR(relatorio.periodo.ate)}`
            : 'Sem recorte',
        ],
        ['Grupos', String(relatorio.grupos.length)],
        ['Gerado por', geradoPor],
        ['Gerado em', dataBR(new Date())],
        ['Definicoes', NOTA_METRICAS],
      ],
      [
        CABECALHOS,
        ...relatorio.grupos.map((g) => [
          g.chave,
          this.numero(g.leadTimeTrilha?.medianaDias ?? null),
          this.numero(g.leadTimeTrilha?.base ?? null),
          this.numero(g.tempoTratamentoEtapa.medianaDias),
          String(g.tempoTratamentoEtapa.base),
          this.numero(g.tempoEmFila.medianaDias),
          String(g.tempoEmFila.base),
          String(g.aprovacaoDireta.etapas),
          String(g.etapasEmAberto.etapas),
          this.numero(g.etapasEmAberto.medianaDias),
        ]),
      ],
    ];

    const corpo = secoes
      .map((bloco) => bloco.map((celulas) => linhaCsv(celulas)).join('\r\n'))
      .join('\r\n\r\n');

    return fecharCsv(corpo);
  }

  nomeArquivo(
    agrupamento: RelatorioCiclo['agrupamento'],
    extensao: 'xlsx' | 'csv',
  ): string {
    const dia = new Date().toISOString().slice(0, 10);
    return `tempo-de-ciclo-por-${agrupamento}-${dia}.${extensao}`;
  }

  /**
   * Número no CSV, com vírgula decimal.
   *
   * O separador de colunas é `;` justamente porque no Excel em português a
   * vírgula é o separador decimal — então o número precisa sair com vírgula,
   * senão `1.5` é lido como texto e não entra em conta nenhuma.
   *
   * `null` vira travessão: célula vazia no meio da linha desloca a leitura.
   */
  private numero(valor: number | null): string {
    if (valor === null) return '—';
    return String(valor).replace('.', ',');
  }
}
