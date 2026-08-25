import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import {
  CriticidadeNaoConformidade,
  StatusCertificacao,
  StatusNaoConformidade,
  TipoEtapa,
} from '@prisma/client';

import type { CertificacoesService } from './certificacoes.service';
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

/**
 * Exportação de um acompanhamento para planilha.
 *
 * Roda no servidor, e não no navegador, por três motivos: os dados já vêm
 * montados por `detalharPorProduto` (que também é onde o escopo do CLIENTE é aplicado),
 * gerar XLSX no cliente exigiria embarcar a mesma biblioteca no bundle, e há
 * precedente — o PDF do certificado também é gerado aqui.
 *
 * ## Estrutura do XLSX
 *
 *  1. **Visão geral** — identificação, resumo e uma linha por etapa.
 *  2. **Uma aba por etapa**, na ordem da trilha: metadados, não conformidades,
 *     histórico da etapa e evidências anexadas.
 *  3. **Histórico** — todas as transições de todas as etapas, em ordem
 *     cronológica. A mesma informação das abas de etapa, mas lida na linha do
 *     tempo em vez de por etapa: é o que responde "o que aconteceu na semana
 *     passada", pergunta que a visão por etapa não responde.
 *
 * ## E o CSV
 *
 * CSV não tem abas — é um formato de uma tabela só. Em vez de fingir que tem,
 * o arquivo empilha as mesmas seções separadas por linhas de título, que é o
 * que abre direto no Excel sem exigir descompactar nada. Quem precisa das abas
 * de verdade usa o XLSX; o CSV existe para quem vai jogar num script, num
 * Google Sheets ou num BI.
 */

type Detalhe = Awaited<ReturnType<CertificacoesService['detalharPorProduto']>>;
type Etapa = Detalhe['etapas'][number];

const ROTULO_STATUS: Record<StatusCertificacao, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  APROVADO: 'Aprovado',
  REPROVADO: 'Reprovado',
};

const ROTULO_TIPO: Record<TipoEtapa, string> = {
  DOCUMENTAL: 'Documental',
  ENSAIO: 'Ensaio',
  AUDITORIA_FABRICA: 'Auditoria de fábrica',
  ANALISE_CRITICA: 'Análise crítica',
  DECISAO: 'Decisão',
  OUTRO: 'Outro',
};

const ROTULO_STATUS_NC: Record<StatusNaoConformidade, string> = {
  ABERTA: 'Aberta',
  EM_TRATATIVA: 'Em tratativa',
  RESOLVIDA: 'Resolvida',
  REPROVADA: 'Reprovada',
};

const ROTULO_CRITICIDADE: Record<CriticidadeNaoConformidade, string> = {
  MENOR: 'Menor',
  MAIOR: 'Maior',
};

@Injectable()
export class ExportacaoCertificacaoService {
  // ---------------------------------------------------------------- XLSX

  async xlsx(detalhe: Detalhe, geradoPor: string): Promise<Buffer> {
    const livro = new Workbook();
    livro.creator = 'ProCert';
    livro.created = new Date();

    this.abaVisaoGeral(livro, detalhe, geradoPor);

    /*
     * Excel recusa nome de aba com mais de 31 caracteres ou com \ / ? * [ ] :,
     * e recusa duplicata. Nome de etapa é texto livre cadastrado pelo admin,
     * então nada disso é hipotético.
     *
     * O exceljs 4.4.0 replica essas regras no `addWorksheet` e **lança** em
     * caractere proibido, nome vazio e duplicata (comparada sem caixa); só o
     * excesso de 31 ele resolve truncando, com aviso no console. Ou seja, sem
     * o saneamento abaixo a exportação viraria 500 na geração — não um arquivo
     * que o Excel recusa depois. Coberto por `exportacao.service.spec.ts`.
     */
    const usados = new Set<string>();
    for (const etapa of detalhe.etapas) {
      this.abaEtapa(livro, etapa, this.nomeAba(etapa, usados));
    }

    this.abaHistorico(livro, detalhe);

    return bufferDoLivro(livro);
  }

  /**
   * Nome da aba desta etapa.
   *
   * A ordem no prefixo é o que separa duas etapas homônimas vindas de versões
   * diferentes da trilha; o saneamento e o desempate são de `nomeAbaSeguro`,
   * compartilhado com as demais exportações.
   */
  private nomeAba(etapa: Etapa, usados: Set<string>): string {
    return nomeAbaSeguro(`${etapa.ordem}. ${etapa.etapa.nome}`, usados);
  }

  private abaVisaoGeral(
    livro: Workbook,
    detalhe: Detalhe,
    geradoPor: string,
  ): void {
    const aba = livro.addWorksheet('Visão geral');
    aba.columns = [{ width: 26 }, { width: 62 }, { width: 18 }, { width: 20 }];

    titulo(aba, 'Acompanhamento de certificação');

    blocoChaveValor(aba, [
      ['Produto', detalhe.produto.nome],
      ['Descrição do produto', detalhe.produto.descricao ?? '—'],
      ['Cliente', detalhe.cliente.nome],
      ['E-mail do cliente', detalhe.cliente.email],
      ['Telefone do cliente', detalhe.cliente.telefone ?? '—'],
    ]);

    aba.addRow([]);
    blocoChaveValor(aba, [
      ['Total de etapas', detalhe.resumo.totalEtapas],
      ['Etapas aprovadas', detalhe.resumo.etapasAprovadas],
      ['Progresso', `${detalhe.resumo.progresso}%`],
      ['Trilha concluída', detalhe.resumo.concluida ? 'Sim' : 'Não'],
      [
        'Obrigatórias aprovadas',
        detalhe.resumo.obrigatoriasAprovadas ? 'Sim' : 'Não',
      ],
    ]);

    aba.addRow([]);
    blocoChaveValor(aba, [
      ['Gerado em', new Date()],
      ['Gerado por', geradoPor],
    ]);

    aba.addRow([]);
    titulo(aba, 'Etapas da trilha');
    tabela(
      aba,
      [
        'Ordem',
        'Etapa',
        'Tipo',
        'Obrigatória',
        'Exige evidência',
        'Situação',
        'NCs abertas',
        'Atualizado em',
      ],
      detalhe.etapas.map((etapa) => [
        etapa.ordem,
        etapa.etapa.nome,
        ROTULO_TIPO[etapa.etapa.tipo],
        etapa.etapa.obrigatoria ? 'Sim' : 'Não',
        etapa.etapa.exigeDocumento ? 'Sim' : 'Não',
        ROTULO_STATUS[etapa.status],
        etapa.naoConformidades.filter(
          (nc) => nc.status === 'ABERTA' || nc.status === 'EM_TRATATIVA',
        ).length,
        etapa.atualizadoEm,
      ]),
    );
  }

  private abaEtapa(livro: Workbook, etapa: Etapa, nome: string): void {
    const aba = livro.addWorksheet(nome);
    aba.columns = [{ width: 24 }, { width: 46 }, { width: 20 }, { width: 20 }, { width: 22 }, { width: 20 }];

    titulo(aba, `Etapa ${etapa.ordem} — ${etapa.etapa.nome}`);

    blocoChaveValor(aba, [
      ['Situação', ROTULO_STATUS[etapa.status]],
      ['Tipo', ROTULO_TIPO[etapa.etapa.tipo]],
      ['Obrigatória', etapa.etapa.obrigatoria ? 'Sim' : 'Não'],
      ['Exige evidência', etapa.etapa.exigeDocumento ? 'Sim' : 'Não'],
      ['Descrição', etapa.etapa.descricao ?? '—'],
      ['Observação atual', etapa.observacao ?? '—'],
      ['Atualizado em', etapa.atualizadoEm],
    ]);

    aba.addRow([]);
    titulo(aba, 'Não conformidades');
    if (etapa.naoConformidades.length === 0) {
      vazio(aba, 'Nenhuma não conformidade registrada nesta etapa.');
    } else {
      tabela(
        aba,
        [
          'Código',
          'Descrição',
          'Criticidade',
          'Situação',
          'Prazo de resposta',
          'Aberta por',
          'Resposta do cliente',
          'Respondida em',
          'Parecer da equipe',
          'Resolvida em',
          'Aberta em',
        ],
        etapa.naoConformidades.map((nc) => [
          nc.codigo,
          nc.descricao,
          ROTULO_CRITICIDADE[nc.criticidade],
          ROTULO_STATUS_NC[nc.status],
          nc.prazoResposta,
          nc.abertoPorNome,
          nc.respostaCliente ?? '—',
          nc.respondidoEm,
          nc.parecer ?? '—',
          nc.resolvidoEm,
          nc.criadoEm,
        ]),
      );
    }

    aba.addRow([]);
    titulo(aba, 'Histórico desta etapa');
    if (etapa.historico.length === 0) {
      vazio(aba, 'Nenhuma alteração registrada.');
    } else {
      tabela(
        aba,
        ['Data', 'De', 'Para', 'Observação', 'Responsável', 'Evidências'],
        etapa.historico.map((h) => [
          h.alteradoEm,
          h.statusAnterior ? ROTULO_STATUS[h.statusAnterior] : '—',
          ROTULO_STATUS[h.statusNovo],
          h.observacao ?? '—',
          h.alteradoPorNome,
          h.documentos.length,
        ]),
      );
    }

    const documentos = etapa.historico.flatMap((h) =>
      h.documentos.map((d) => ({ ...d, alteradoEm: h.alteradoEm })),
    );

    aba.addRow([]);
    titulo(aba, 'Evidências anexadas');
    if (documentos.length === 0) {
      vazio(aba, 'Nenhuma evidência anexada.');
    } else {
      tabela(
        aba,
        ['Arquivo', 'Tipo', 'Tamanho (KB)', 'Enviado por', 'Enviado em'],
        documentos.map((d) => [
          d.nomeArquivo,
          d.tipoMime,
          Math.max(1, Math.round(d.tamanhoBytes / 1024)),
          d.enviadoPorNome,
          d.criadoEm,
        ]),
      );
    }
  }

  private abaHistorico(livro: Workbook, detalhe: Detalhe): void {
    const aba = livro.addWorksheet('Histórico');
    aba.columns = [
      { width: 20 },
      { width: 8 },
      { width: 30 },
      { width: 16 },
      { width: 16 },
      { width: 52 },
      { width: 26 },
      { width: 12 },
    ];

    titulo(aba, 'Histórico completo do acompanhamento');

    /*
     * Ordem cronológica decrescente — o mais recente primeiro, como na
     * timeline da tela. `porProduto` já devolve o histórico ordenado DENTRO de
     * cada etapa; aqui as etapas são intercaladas, então a ordenação precisa
     * ser refeita sobre o conjunto.
     */
    const linhas = detalhe.etapas
      .flatMap((etapa) =>
        etapa.historico.map((h) => ({ etapa, historico: h })),
      )
      .sort(
        (a, b) =>
          b.historico.alteradoEm.getTime() - a.historico.alteradoEm.getTime(),
      );

    if (linhas.length === 0) {
      vazio(aba, 'Nenhuma alteração registrada até agora.');
      return;
    }

    tabela(
      aba,
      [
        'Data',
        'Ordem',
        'Etapa',
        'De',
        'Para',
        'Observação',
        'Responsável',
        'Evidências',
      ],
      linhas.map(({ etapa, historico }) => [
        historico.alteradoEm,
        etapa.ordem,
        etapa.etapa.nome,
        historico.statusAnterior
          ? ROTULO_STATUS[historico.statusAnterior]
          : '—',
        ROTULO_STATUS[historico.statusNovo],
        historico.observacao ?? '—',
        historico.alteradoPorNome,
        historico.documentos.length,
      ]),
    );
  }


  // ----------------------------------------------------------------- CSV

  csv(detalhe: Detalhe, geradoPor: string): string {
    const secoes: string[][][] = [];

    secoes.push([
      ['ACOMPANHAMENTO DE CERTIFICAÇÃO'],
      ['Produto', detalhe.produto.nome],
      ['Descrição do produto', detalhe.produto.descricao ?? '—'],
      ['Cliente', detalhe.cliente.nome],
      ['E-mail do cliente', detalhe.cliente.email],
      ['Telefone do cliente', detalhe.cliente.telefone ?? '—'],
      ['Total de etapas', String(detalhe.resumo.totalEtapas)],
      ['Etapas aprovadas', String(detalhe.resumo.etapasAprovadas)],
      ['Progresso', `${detalhe.resumo.progresso}%`],
      ['Trilha concluída', detalhe.resumo.concluida ? 'Sim' : 'Não'],
      [
        'Obrigatórias aprovadas',
        detalhe.resumo.obrigatoriasAprovadas ? 'Sim' : 'Não',
      ],
      ['Gerado em', dataBR(new Date())],
      ['Gerado por', geradoPor],
    ]);

    secoes.push([
      ['ETAPAS DA TRILHA'],
      [
        'Ordem',
        'Etapa',
        'Tipo',
        'Obrigatória',
        'Exige evidência',
        'Situação',
        'NCs abertas',
        'Atualizado em',
      ],
      ...detalhe.etapas.map((etapa) => [
        String(etapa.ordem),
        etapa.etapa.nome,
        ROTULO_TIPO[etapa.etapa.tipo],
        etapa.etapa.obrigatoria ? 'Sim' : 'Não',
        etapa.etapa.exigeDocumento ? 'Sim' : 'Não',
        ROTULO_STATUS[etapa.status],
        String(
          etapa.naoConformidades.filter(
            (nc) => nc.status === 'ABERTA' || nc.status === 'EM_TRATATIVA',
          ).length,
        ),
        dataBR(etapa.atualizadoEm),
      ]),
    ]);

    for (const etapa of detalhe.etapas) {
      secoes.push([
        [`ETAPA ${etapa.ordem} — ${etapa.etapa.nome}`],
        ['Situação', ROTULO_STATUS[etapa.status]],
        ['Tipo', ROTULO_TIPO[etapa.etapa.tipo]],
        ['Obrigatória', etapa.etapa.obrigatoria ? 'Sim' : 'Não'],
        ['Exige evidência', etapa.etapa.exigeDocumento ? 'Sim' : 'Não'],
        ['Descrição', etapa.etapa.descricao ?? '—'],
        ['Observação atual', etapa.observacao ?? '—'],
        ['Atualizado em', dataBR(etapa.atualizadoEm)],
      ]);

      secoes.push([
        [`  Não conformidades — etapa ${etapa.ordem}`],
        ...(etapa.naoConformidades.length === 0
          ? [['Nenhuma não conformidade registrada.']]
          : [
              [
                'Código',
                'Descrição',
                'Criticidade',
                'Situação',
                'Prazo de resposta',
                'Aberta por',
                'Resposta do cliente',
                'Respondida em',
                'Parecer da equipe',
                'Resolvida em',
                'Aberta em',
              ],
              ...etapa.naoConformidades.map((nc) => [
                nc.codigo,
                nc.descricao,
                ROTULO_CRITICIDADE[nc.criticidade],
                ROTULO_STATUS_NC[nc.status],
                dataBR(nc.prazoResposta),
                nc.abertoPorNome,
                nc.respostaCliente ?? '—',
                dataBR(nc.respondidoEm),
                nc.parecer ?? '—',
                dataBR(nc.resolvidoEm),
                dataBR(nc.criadoEm),
              ]),
            ]),
      ]);

      secoes.push([
        [`  Histórico — etapa ${etapa.ordem}`],
        ...(etapa.historico.length === 0
          ? [['Nenhuma alteração registrada.']]
          : [
              ['Data', 'De', 'Para', 'Observação', 'Responsável', 'Evidências'],
              ...etapa.historico.map((h) => [
                dataBR(h.alteradoEm),
                h.statusAnterior ? ROTULO_STATUS[h.statusAnterior] : '—',
                ROTULO_STATUS[h.statusNovo],
                h.observacao ?? '—',
                h.alteradoPorNome,
                String(h.documentos.length),
              ]),
            ]),
      ]);
    }

    const historico = detalhe.etapas
      .flatMap((etapa) => etapa.historico.map((h) => ({ etapa, h })))
      .sort((a, b) => b.h.alteradoEm.getTime() - a.h.alteradoEm.getTime());

    secoes.push([
      ['HISTÓRICO COMPLETO'],
      ...(historico.length === 0
        ? [['Nenhuma alteração registrada até agora.']]
        : [
            [
              'Data',
              'Ordem',
              'Etapa',
              'De',
              'Para',
              'Observação',
              'Responsável',
              'Evidências',
            ],
            ...historico.map(({ etapa, h }) => [
              dataBR(h.alteradoEm),
              String(etapa.ordem),
              etapa.etapa.nome,
              h.statusAnterior ? ROTULO_STATUS[h.statusAnterior] : '—',
              ROTULO_STATUS[h.statusNovo],
              h.observacao ?? '—',
              h.alteradoPorNome,
              String(h.documentos.length),
            ]),
          ]),
    ]);

    const corpo = secoes
      .map((linhas) => linhas.map((celulas) => linhaCsv(celulas)).join('\r\n'))
      .join('\r\n\r\n');

    return fecharCsv(corpo);
  }


  // -------------------------------------------------------------- arquivo

  /**
   * Nome do arquivo baixado.
   *
   * Sem acento e sem espaço: o `Content-Disposition` é ASCII, e cliente HTTP
   * antigo trunca o nome no primeiro caractere fora da faixa. A data no fim é
   * o que evita `acompanhamento.xlsx (3)` na pasta de Downloads.
   */
  nomeArquivo(detalhe: Detalhe, extensao: 'xlsx' | 'csv'): string {
    const base = baseDeNomeArquivo(detalhe.produto.nome, 'produto');
    const dia = new Date().toISOString().slice(0, 10);
    return `acompanhamento-${base}-${dia}.${extensao}`;
  }
}
