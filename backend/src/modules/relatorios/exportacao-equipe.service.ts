import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';

import {
  baseDeNomeArquivo,
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
import type { LinhaEquipe } from './equipe.service';

/**
 * Planilha do relatório de desempenho da equipe.
 *
 * Reaproveita `common/planilha` — as regras que fazem o arquivo abrir de fato
 * no Excel (data como `Date` com `numFmt`, BOM de UTF-8, separador `;`,
 * saneamento de nome de aba) são as mesmas da exportação de acompanhamento e
 * **não foram reescritas**.
 *
 * ## Carteira e atividade ficam em blocos separados
 *
 * Mesma regra da API e da tela. As colunas de atividade vivem sob o cabeçalho
 * do período; a carteira sai à parte, com o aviso de que ignora o recorte. Uma
 * planilha que misture as duas vai para a reunião sugerindo uma relação de
 * causa que não existe: carteira grande não implica atividade alta, e o
 * contrário também não.
 */

const ROTULO_PAPEL: Record<string, string> = {
  ADMIN: 'Administrador',
  FUNCIONARIO: 'Funcionário',
};

const ROTULO_STATUS: Record<string, string> = {
  ATIVO: 'Ativo',
  INATIVO: 'Inativo',
};

interface Periodo {
  de: string;
  ate: string;
}

const CABECALHOS = [
  'Colaborador',
  'E-mail',
  'Papel',
  'Situação',
  'Clientes na carteira (hoje)',
  'Etapas avaliadas',
  'Aprovações',
  'Reprovações',
  'NCs abertas',
  'Certificados emitidos',
  'Documentos enviados',
  'Última movimentação',
  'Último acesso da conta',
];

@Injectable()
export class ExportacaoEquipeService {
  async xlsx(
    linhas: LinhaEquipe[],
    periodo: Periodo,
    geradoPor: string,
  ): Promise<Buffer> {
    const livro = new Workbook();
    livro.creator = 'ProCert';
    livro.created = new Date();

    const usados = new Set<string>();
    const aba = livro.addWorksheet(nomeAbaSeguro('Desempenho da equipe', usados));

    titulo(aba, 'DESEMPENHO DA EQUIPE');
    blocoChaveValor(aba, [
      ['Período da atividade', `${dataBR(periodo.de)} a ${dataBR(periodo.ate)}`],
      ['Colaboradores', linhas.length],
      ['Gerado por', geradoPor],
      ['Gerado em', new Date()],
    ]);
    aba.addRow([]);

    vazio(
      aba,
      'A coluna "Clientes na carteira" é um retrato de hoje e NÃO respeita o período acima. ' +
        'As demais colunas são a atividade registrada dentro do período.',
    );
    aba.addRow([]);

    if (linhas.length === 0) {
      vazio(aba, 'Nenhum colaborador encontrado.');
    } else {
      tabela(
        aba,
        CABECALHOS,
        linhas.map((l) => [
          l.nome,
          l.email,
          ROTULO_PAPEL[l.role] ?? l.role,
          ROTULO_STATUS[l.status] ?? l.status,
          l.carteira.clientes,
          l.atividade.etapasAvaliadas,
          l.atividade.aprovacoes,
          l.atividade.reprovacoes,
          l.atividade.ncsAbertas,
          l.atividade.certificadosEmitidos,
          l.atividade.documentosEnviados,
          // `Date`, e não texto: é o que faz o autofiltro do Excel ordenar de
          // verdade. Como string, 10/01 vem antes de 02/12.
          l.atividade.ultimaMovimentacao,
          l.ultimoAcessoEm,
        ]),
      );
    }

    aba.columns.forEach((coluna, indice) => {
      coluna.width = indice <= 1 ? 34 : 18;
    });

    return bufferDoLivro(livro);
  }

  csv(linhas: LinhaEquipe[], periodo: Periodo, geradoPor: string): string {
    const secoes: string[][][] = [];

    secoes.push([
      ['DESEMPENHO DA EQUIPE'],
      ['Período da atividade', `${dataBR(periodo.de)} a ${dataBR(periodo.ate)}`],
      ['Colaboradores', String(linhas.length)],
      ['Gerado por', geradoPor],
      ['Gerado em', dataBR(new Date())],
      [
        'Atenção',
        'A coluna "Clientes na carteira" é um retrato de hoje e NAO respeita o período acima.',
      ],
    ]);

    secoes.push([
      CABECALHOS,
      ...linhas.map((l) => [
        l.nome,
        l.email,
        ROTULO_PAPEL[l.role] ?? l.role,
        ROTULO_STATUS[l.status] ?? l.status,
        String(l.carteira.clientes),
        String(l.atividade.etapasAvaliadas),
        String(l.atividade.aprovacoes),
        String(l.atividade.reprovacoes),
        String(l.atividade.ncsAbertas),
        String(l.atividade.certificadosEmitidos),
        String(l.atividade.documentosEnviados),
        dataBR(l.atividade.ultimaMovimentacao),
        dataBR(l.ultimoAcessoEm),
      ]),
    ]);

    const corpo = secoes
      .map((bloco) => bloco.map((celulas) => linhaCsv(celulas)).join('\r\n'))
      .join('\r\n\r\n');

    return fecharCsv(corpo);
  }

  nomeArquivo(periodo: Periodo, extensao: 'xlsx' | 'csv'): string {
    const de = baseDeNomeArquivo(periodo.de.slice(0, 10), 'inicio');
    const ate = baseDeNomeArquivo(periodo.ate.slice(0, 10), 'fim');
    return `desempenho-equipe-${de}-a-${ate}.${extensao}`;
  }
}
