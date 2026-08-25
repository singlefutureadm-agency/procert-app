import { Workbook, type Worksheet } from 'exceljs';

/**
 * Regras de planilha compartilhadas por todas as exportações da API.
 *
 * Extraído de `modules/certificacoes/exportacao.service.ts` quando o relatório
 * de equipe passou a exportar também. **Nenhuma regra foi reescrita** — cada
 * uma delas nasceu de um arquivo que o Excel recusava ou abria errado, e estão
 * cobertas por `exportacao.service.spec.ts`, que exercita só a API pública do
 * serviço e por isso não precisou de uma linha de ajuste neste refactor.
 *
 * O que mora aqui é o que **não depende do domínio**: o Excel não sabe o que é
 * uma etapa de trilha. Rótulos de enum, ordem das abas e o que entra em cada
 * coluna continuam em cada serviço de exportação.
 */

/** Azul da marca, para o cabeçalho das tabelas. */
export const AZUL = 'FF0D6EFD';

export const FORMATO_DATA = 'dd/mm/yyyy hh:mm';

/** Limite do Excel para nome de aba. O exceljs trunca (com aviso) acima disso. */
export const LIMITE_NOME_ABA = 31;

/**
 * Nome de aba que o Excel aceita.
 *
 * O exceljs **lança** em caractere proibido, nome vazio e duplicata (comparada
 * sem caixa); só o excesso de 31 caracteres ele trunca. Sem este saneamento a
 * exportação vira 500 na geração, não uma planilha estranha — e nome de aba
 * costuma sair de texto livre cadastrado pelo admin.
 *
 * Cada tentativa de desempate parte da BASE, nunca do nome já sufixado:
 * derivar do anterior empilha marcas (`Ensaio(2)(3)(4)`) e estoura o limite a
 * partir de `(10)`, que ocupa 4 caracteres e não 3 — o exceljs truncava de
 * volta e comia o parêntese de fechamento.
 */
export function nomeAbaSeguro(bruto: string, usados: Set<string>): string {
  // Os SETE que o Excel proíbe: \ / ? * [ ] :
  // A barra fica no fim da classe para não precisar de escape (o ESLint recusa
  // `\/` como escape inútil), mas ela continua na lista.
  const limpo = bruto.replace(/[\\?*[\]:/]/g, '-').trim();
  // O exceljs recusa nome vazio; texto que era só caractere proibido zeraria.
  const base = limpo || 'Planilha';
  let nome = base.slice(0, LIMITE_NOME_ABA);

  let sufixo = 2;
  while (usados.has(nome.toLowerCase())) {
    const marca = `(${sufixo++})`;
    nome = base.slice(0, LIMITE_NOME_ABA - marca.length) + marca;
  }
  usados.add(nome.toLowerCase());
  return nome;
}

/** Aplica o formato de data quando — e só quando — a célula guarda um `Date`. */
export function formatarSeData(celula: {
  value: unknown;
  numFmt?: string;
}): void {
  if (celula.value instanceof Date) celula.numFmt = FORMATO_DATA;
}

export function titulo(aba: Worksheet, texto: string): void {
  const linha = aba.addRow([texto]);
  linha.font = { bold: true, size: 13 };
  linha.height = 22;
}

export function vazio(aba: Worksheet, texto: string): void {
  const linha = aba.addRow([texto]);
  linha.font = { italic: true, color: { argb: 'FF6B7280' } };
}

export function blocoChaveValor(
  aba: Worksheet,
  pares: Array<[string, string | number | Date | null]>,
): void {
  for (const [chave, valor] of pares) {
    const linha = aba.addRow([chave, valor ?? '—']);
    linha.getCell(1).font = { bold: true };
    formatarSeData(linha.getCell(2));
    linha.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  }
}

/**
 * Tabela com cabeçalho destacado e **autofiltro**.
 *
 * O autofiltro é a razão de as datas irem como `Date` de verdade e não como
 * texto: filtro de data sobre string ordena 10/01 antes de 02/12.
 */
export function tabela(
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
    linha.eachCell((celula) => formatarSeData(celula));
  }

  const primeira = linhaCabecalho.number;
  const ultima = primeira + linhas.length;
  aba.autoFilter = {
    from: { row: primeira, column: 1 },
    to: { row: ultima, column: cabecalhos.length },
  };
}

/**
 * Buffer do arquivo.
 *
 * `as Buffer`: a tipagem do exceljs promete `ArrayBuffer`, mas no Node ele
 * devolve `Buffer` — e é `Buffer` que o `res.send` espera.
 */
export async function bufferDoLivro(livro: Workbook): Promise<Buffer> {
  return (await livro.xlsx.writeBuffer()) as unknown as Buffer;
}

// ------------------------------------------------------------------- CSV

export function linhaCsv(celulas: string[]): string {
  return celulas.map((c) => escaparCsv(c)).join(';');
}

/**
 * Envelope obrigatório quando há separador, aspas ou quebra de linha —
 * observação de etapa é texto livre e traz as três.
 */
export function escaparCsv(valor: string): string {
  const texto = valor ?? '';
  if (/[";\r\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

/**
 * Fecha o arquivo CSV.
 *
 * **BOM de UTF-8**: sem ele o Excel do Windows abre em ANSI e todo acento vira
 * caractere quebrado — "Não conformidade" sai "NÃ£o". O separador `;` vem pelo
 * mesmo motivo: no Excel em português a vírgula é separador decimal, e com `,`
 * a planilha inteira cai numa coluna só.
 */
export function fecharCsv(corpo: string): string {
  return '\ufeff' + corpo + '\r\n';
}

export function dataBR(valor: Date | string | null | undefined): string {
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

// --------------------------------------------------------------- arquivo

/**
 * Base de nome de arquivo sem acento e sem espaço.
 *
 * O `Content-Disposition` é ASCII, e cliente HTTP antigo trunca o nome no
 * primeiro caractere fora da faixa.
 */
export function baseDeNomeArquivo(bruto: string, padrao: string): string {
  const base = bruto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);

  return base || padrao;
}
