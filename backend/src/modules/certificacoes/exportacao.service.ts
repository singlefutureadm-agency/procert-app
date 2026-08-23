import { Injectable } from '@nestjs/common';
import { Workbook, type Worksheet } from 'exceljs';
import {
  CriticidadeNaoConformidade,
  StatusCertificacao,
  StatusNaoConformidade,
  TipoEtapa,
} from '@prisma/client';

import type { CertificacoesService } from './certificacoes.service';

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

/** Azul da marca, para o cabeçalho das tabelas. */
const AZUL = 'FF0D6EFD';
const FORMATO_DATA = 'dd/mm/yyyy hh:mm';

/** Limite do Excel para nome de aba. O exceljs trunca (com aviso) acima disso. */
const LIMITE_NOME_ABA = 31;

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

    // `as Buffer`: a tipagem do exceljs promete ArrayBuffer, mas no Node ele
    // devolve Buffer — e é Buffer que o `res.send` espera.
    return (await livro.xlsx.writeBuffer()) as unknown as Buffer;
  }

  private nomeAba(etapa: Etapa, usados: Set<string>): string {
    const limpo = etapa.etapa.nome.replace(/[\\/?*[\]:]/g, '-').trim();
    const base = `${etapa.ordem}. ${limpo}`;
    let nome = base.slice(0, LIMITE_NOME_ABA);

    /*
     * Duas etapas podem ter o mesmo nome em versões diferentes da trilha; a
     * ordem é o que as separa, e ela já vai no prefixo. O sufixo cobre o caso
     * em que o truncamento em 31 caracteres apagou justamente a diferença.
     *
     * Cada tentativa parte da BASE, não do nome já sufixado. Reaproveitar o
     * anterior empilhava as marcas (`1. Ensaio(2)(3)(4)`) e, com o corte fixo
     * em 28, estourava o limite a partir de `(10)` — que ocupa 4 caracteres, e
     * não 3. O exceljs truncava de volta para 31 e comia o parêntese de
     * fechamento, deixando `(10` no lugar de `(10)`.
     */
    let sufixo = 2;
    while (usados.has(nome.toLowerCase())) {
      const marca = `(${sufixo++})`;
      nome = base.slice(0, LIMITE_NOME_ABA - marca.length) + marca;
    }
    usados.add(nome.toLowerCase());
    return nome;
  }

  private abaVisaoGeral(
    livro: Workbook,
    detalhe: Detalhe,
    geradoPor: string,
  ): void {
    const aba = livro.addWorksheet('Visão geral');
    aba.columns = [{ width: 26 }, { width: 62 }, { width: 18 }, { width: 20 }];

    this.titulo(aba, 'Acompanhamento de certificação');

    this.blocoChaveValor(aba, [
      ['Produto', detalhe.produto.nome],
      ['Descrição do produto', detalhe.produto.descricao ?? '—'],
      ['Cliente', detalhe.cliente.nome],
      ['E-mail do cliente', detalhe.cliente.email],
      ['Telefone do cliente', detalhe.cliente.telefone ?? '—'],
    ]);

    aba.addRow([]);
    this.blocoChaveValor(aba, [
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
    this.blocoChaveValor(aba, [
      ['Gerado em', new Date()],
      ['Gerado por', geradoPor],
    ]);

    aba.addRow([]);
    this.titulo(aba, 'Etapas da trilha');
    this.tabela(
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

    this.titulo(aba, `Etapa ${etapa.ordem} — ${etapa.etapa.nome}`);

    this.blocoChaveValor(aba, [
      ['Situação', ROTULO_STATUS[etapa.status]],
      ['Tipo', ROTULO_TIPO[etapa.etapa.tipo]],
      ['Obrigatória', etapa.etapa.obrigatoria ? 'Sim' : 'Não'],
      ['Exige evidência', etapa.etapa.exigeDocumento ? 'Sim' : 'Não'],
      ['Descrição', etapa.etapa.descricao ?? '—'],
      ['Observação atual', etapa.observacao ?? '—'],
      ['Atualizado em', etapa.atualizadoEm],
    ]);

    aba.addRow([]);
    this.titulo(aba, 'Não conformidades');
    if (etapa.naoConformidades.length === 0) {
      this.vazio(aba, 'Nenhuma não conformidade registrada nesta etapa.');
    } else {
      this.tabela(
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
    this.titulo(aba, 'Histórico desta etapa');
    if (etapa.historico.length === 0) {
      this.vazio(aba, 'Nenhuma alteração registrada.');
    } else {
      this.tabela(
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
    this.titulo(aba, 'Evidências anexadas');
    if (documentos.length === 0) {
      this.vazio(aba, 'Nenhuma evidência anexada.');
    } else {
      this.tabela(
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

    this.titulo(aba, 'Histórico completo do acompanhamento');

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
      this.vazio(aba, 'Nenhuma alteração registrada até agora.');
      return;
    }

    this.tabela(
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

  // --------------------------------------------------- auxiliares do XLSX

  private titulo(aba: Worksheet, texto: string): void {
    const linha = aba.addRow([texto]);
    linha.font = { bold: true, size: 13 };
    linha.height = 22;
  }

  private vazio(aba: Worksheet, texto: string): void {
    const linha = aba.addRow([texto]);
    linha.font = { italic: true, color: { argb: 'FF6B7280' } };
  }

  private blocoChaveValor(
    aba: Worksheet,
    pares: Array<[string, string | number | Date | null]>,
  ): void {
    for (const [chave, valor] of pares) {
      const linha = aba.addRow([chave, valor ?? '—']);
      linha.getCell(1).font = { bold: true };
      this.formatarSeData(linha.getCell(2));
      linha.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    }
  }

  private tabela(
    aba: Worksheet,
    cabecalhos: string[],
    linhas: Array<Array<string | number | Date | null>>,
  ): void {
    const linhaCabecalho = aba.addRow(cabecalhos);
    linhaCabecalho.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    linhaCabecalho.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: AZUL },
    };
    linhaCabecalho.alignment = { vertical: 'middle' };
    linhaCabecalho.height = 20;

    for (const dados of linhas) {
      const linha = aba.addRow(dados.map((v) => v ?? '—'));
      linha.alignment = { wrapText: true, vertical: 'top' };
      linha.eachCell((celula) => this.formatarSeData(celula));
    }

    /*
     * Autofiltro na faixa da tabela. É o que permite ordenar e filtrar sem
     * mexer no arquivo — e é a razão de as datas irem como Date de verdade e
     * não como texto: filtro de data sobre string ordena 10/01 antes de 02/12.
     */
    const primeira = linhaCabecalho.number;
    const ultima = primeira + linhas.length;
    aba.autoFilter = {
      from: { row: primeira, column: 1 },
      to: { row: ultima, column: cabecalhos.length },
    };
  }

  private formatarSeData(celula: {
    value: unknown;
    numFmt?: string;
  }): void {
    if (celula.value instanceof Date) celula.numFmt = FORMATO_DATA;
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
      ['Gerado em', this.dataBR(new Date())],
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
        this.dataBR(etapa.atualizadoEm),
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
        ['Atualizado em', this.dataBR(etapa.atualizadoEm)],
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
                this.dataBR(nc.prazoResposta),
                nc.abertoPorNome,
                nc.respostaCliente ?? '—',
                this.dataBR(nc.respondidoEm),
                nc.parecer ?? '—',
                this.dataBR(nc.resolvidoEm),
                this.dataBR(nc.criadoEm),
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
                this.dataBR(h.alteradoEm),
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
              this.dataBR(h.alteradoEm),
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
      .map((linhas) => linhas.map((celulas) => this.linhaCsv(celulas)).join('\r\n'))
      .join('\r\n\r\n');

    /*
     * BOM de UTF-8. Sem ele o Excel do Windows abre o arquivo em ANSI e todo
     * acento vira caractere quebrado — "Não conformidade" sai "NÃ£o". O
     * separador é `;` pelo mesmo motivo: no Excel em português a vírgula é
     * separador decimal, e com `,` a planilha inteira cai numa coluna só.
     */
    return '﻿' + corpo + '\r\n';
  }

  private linhaCsv(celulas: string[]): string {
    return celulas.map((c) => this.escaparCsv(c)).join(';');
  }

  private escaparCsv(valor: string): string {
    const texto = valor ?? '';
    // Aspas duplicadas e envelope obrigatório quando há separador, aspas ou
    // quebra de linha — observação de etapa é texto livre e traz as três.
    if (/[";\r\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
    return texto;
  }

  private dataBR(valor: Date | string | null | undefined): string {
    if (!valor) return '—';
    const data = valor instanceof Date ? valor : new Date(valor);
    if (Number.isNaN(data.getTime())) return '—';
    return data.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
    const base = detalhe.produto.nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60);

    const dia = new Date().toISOString().slice(0, 10);
    return `acompanhamento-${base || 'produto'}-${dia}.${extensao}`;
  }
}
