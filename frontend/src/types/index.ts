/**
 * Contratos compartilhados com a API.
 * Espelham os enums e os selects do Prisma no backend.
 */

export type Role = 'ADMIN' | 'FUNCIONARIO' | 'CLIENTE';
export type StatusRegistro = 'ATIVO' | 'INATIVO';
export type TipoPessoa = 'FISICA' | 'JURIDICA';
export type StatusCertificacao =
  | 'PENDENTE'
  | 'EM_ANDAMENTO'
  | 'APROVADO'
  | 'REPROVADO';
export type StatusPagamento = 'PENDENTE' | 'PAGO' | 'CANCELADO' | 'ESTORNADO';

export interface UsuarioSessao {
  id: number;
  nome: string;
  email: string;
  role: Role;
  fotoUrl: string | null;
}

export interface RespostaLogin {
  accessToken: string;
  usuario: UsuarioSessao;
}

export interface Estado {
  id: number;
  sigla: string;
  nome: string;
}

interface PessoaBase {
  id: number;
  nome: string;
  email: string;
  tipoPessoa: TipoPessoa;
  cpf: string | null;
  cnpj: string | null;
  dataNascimento: string | null;
  telefone: string | null;
  cep: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  estadoId: number | null;
  estado: Estado | null;
  fotoUrl: string | null;
  status: StatusRegistro;
  /**
   * Último login bem-sucedido desta conta; `null` enquanto nunca houve um.
   *
   * É o acesso DA CONTA, não "do cliente": a linha é a própria credencial, e
   * uma senha compartilhada entre várias pessoas da empresa aparece aqui como
   * um acesso só. Responde "quem sumiu", não frequência de uso.
   */
  ultimoAcessoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export type Cliente = PessoaBase;

export interface Funcionario extends PessoaBase {
  role: Exclude<Role, 'CLIENTE'>;
}

export type TipoEtapa =
  | 'DOCUMENTAL'
  | 'ENSAIO'
  | 'AUDITORIA_FABRICA'
  | 'ANALISE_CRITICA'
  | 'DECISAO'
  | 'OUTRO';

/** Etapa prevista por uma versão de trilha. */
export interface ModeloEtapa {
  id: number;
  modeloTrilhaId: number;
  nome: string;
  descricao: string | null;
  ordem: number;
  tipo: TipoEtapa;
  obrigatoria: boolean;
  prazoSlaDias: number | null;
  exigeDocumento: boolean;
}

/** Payload de escrita de etapa (sem id/ordem: a ordem vem da posição na lista). */
export interface EtapaModeloEntrada {
  nome: string;
  descricao?: string;
  tipo?: TipoEtapa;
  obrigatoria?: boolean;
  prazoSlaDias?: number;
  exigeDocumento?: boolean;
}

export interface ModeloTrilha {
  id: number;
  categoriaId: number;
  versao: number;
  ativo: boolean;
  vigenteDe: string;
  vigenteAte: string | null;
  criadoEm: string;
  etapas: ModeloEtapa[];
  totalProdutos: number;
  /** Versão sem produtos vinculados ainda aceita edição direta das etapas. */
  editavel: boolean;
}

export interface ResumoModeloVigente {
  id: number;
  versao: number;
  vigenteDe?: string;
  totalEtapas: number;
  totalProdutos?: number;
}

export interface CategoriaProduto {
  id: number;
  nome: string;
  descricao: string | null;
  normaReferencia: string | null;
  validadeMeses: number;
  status: StatusRegistro;
  criadoEm: string;
  atualizadoEm: string;
  totalProdutos: number;
  totalVersoes: number;
  modeloVigente: ResumoModeloVigente | null;
}

/** Item do select de categorias no cadastro de produto. */
export interface CategoriaResumo {
  id: number;
  nome: string;
  normaReferencia: string | null;
  modeloVigente: { id: number; versao: number; totalEtapas: number } | null;
}

export interface SituacaoVersaoTrilha {
  atualizado: boolean;
  versaoProduto: number;
  versaoVigente: number;
  etapasAAdicionar: Array<{
    id: number;
    nome: string;
    tipo: TipoEtapa;
    obrigatoria: boolean;
  }>;
  mensagem: string;
  adicionadas?: number;
}

export interface ResumoCertificacao {
  totalEtapas: number;
  etapasAprovadas: number;
  progresso: number;
  etapaAtual: string | null;
  concluida: boolean;
}

export interface Produto {
  id: number;
  clienteId: number;
  categoriaId: number;
  modeloTrilhaId: number;
  nome: string;
  descricao: string | null;
  preco: number;
  fotoUrl: string | null;
  status: StatusRegistro;
  criadoEm: string;
  atualizadoEm: string;
  cliente: { id: number; nome: string; fotoUrl: string | null };
  categoria: { id: number; nome: string; normaReferencia: string | null };
  modeloTrilha: { id: number; versao: number; ativo: boolean };
  certificacao: Array<{
    id: number;
    /** Posição na trilha do produto. */
    ordem: number;
    status: StatusCertificacao;
    etapa: { id: number; nome: string; tipo: TipoEtapa; obrigatoria: boolean };
  }>;
  ultimoPagamento: {
    id: number;
    status: StatusPagamento;
    valor: number;
    dataPagamento: string | null;
  } | null;
  resumoCertificacao: ResumoCertificacao;
}

export type StatusCertificado =
  | 'EMITIDO'
  | 'SUSPENSO'
  | 'CANCELADO'
  | 'VENCIDO';

export interface Certificado {
  id: number;
  produtoId: number;
  numero: string;
  escopo: string;
  dataEmissao: string;
  dataValidade: string;
  status: StatusCertificado;
  motivoStatus: string | null;
  emitidoPorNome: string;
  arquivoPdf: string | null;
  criadoEm: string;
  produto: {
    id: number;
    nome: string;
    clienteId: number;
    cliente: { id: number; nome: string };
    categoria: { id: number; nome: string; normaReferencia: string | null };
  };
}

/**
 * Certificado na tela de vencimentos, com os dias já calculados no servidor.
 *
 * `diasRestantes` não é derivado aqui de propósito: o corte de faixa usa a
 * meia-noite do SERVIDOR, e recalcular no navegador faria um cliente em outro
 * fuso ver um certificado numa faixa diferente da que o resumo conta.
 */
export interface CertificadoEmRisco extends Certificado {
  /** Negativo quando a validade já passou. */
  diasRestantes: number;
}

export type ChaveFaixaVencimento =
  | 'vencido'
  | '30'
  | '60'
  | '90'
  | '180'
  | 'depois';

export interface ResumoVencimentos {
  janelaDias: number;
  /** Toda a carteira vigente, não só a janela — é o denominador. */
  totalVigentes: number;
  faixas: Array<{ chave: ChaveFaixaVencimento; rotulo: string; total: number }>;
}

export type CriticidadeNaoConformidade = 'MENOR' | 'MAIOR';

export type StatusNaoConformidade =
  | 'ABERTA'
  | 'EM_TRATATIVA'
  | 'RESOLVIDA'
  | 'REPROVADA';

export interface NaoConformidade {
  id: number;
  codigo: string;
  descricao: string;
  criticidade: CriticidadeNaoConformidade;
  status: StatusNaoConformidade;
  prazoResposta: string | null;
  respostaCliente: string | null;
  respondidoEm: string | null;
  parecer: string | null;
  abertoPorNome: string;
  resolvidoEm: string | null;
  criadoEm: string;
}

/** NC com o contexto da etapa e do produto — usado na listagem dedicada. */
export interface NaoConformidadeDetalhada extends NaoConformidade {
  certificacaoId: number;
  certificacao: {
    id: number;
    status: StatusCertificacao;
    ordem: number;
    etapa: { id: number; nome: string };
    produto: {
      id: number;
      nome: string;
      clienteId: number;
      cliente: { id: number; nome: string };
    };
  };
}

/** Payload de abertura, também aceito dentro do salvamento em lote. */
export interface AberturaNaoConformidade {
  descricao: string;
  criticidade: CriticidadeNaoConformidade;
  prazoResposta?: string;
}

export interface DocumentoCertificacao {
  id: number;
  nomeArquivo: string;
  tipoMime: string;
  tamanhoBytes: number;
  enviadoPorNome: string;
  criadoEm: string;
}

export interface HistoricoCertificacao {
  id: number;
  statusAnterior: StatusCertificacao | null;
  statusNovo: StatusCertificacao;
  observacao: string | null;
  alteradoPorNome: string;
  alteradoEm: string;
  documentos: DocumentoCertificacao[];
}

export interface EtapaTimeline {
  id: number;
  /** Posição na trilha do produto (não a do modelo, que pode colidir). */
  ordem: number;
  status: StatusCertificacao;
  observacao: string | null;
  atualizadoEm: string;
  etapa: {
    id: number;
    nome: string;
    descricao: string | null;
    tipo: TipoEtapa;
    obrigatoria: boolean;
    exigeDocumento: boolean;
  };
  naoConformidades: NaoConformidade[];
  historico: HistoricoCertificacao[];
}

export interface CertificacaoDetalhe {
  produto: {
    id: number;
    nome: string;
    descricao: string | null;
    fotoUrl: string | null;
  };
  cliente: {
    id: number;
    nome: string;
    email: string;
    telefone: string | null;
    fotoUrl: string | null;
  };
  etapas: EtapaTimeline[];
  resumo: Omit<ResumoCertificacao, 'etapaAtual'> & {
    /** Habilita a emissão do certificado: opcionais pendentes não bloqueiam. */
    obrigatoriasAprovadas: boolean;
  };
}

export interface LinhaPainelCertificacao {
  produtoId: number;
  produto: string;
  produtoFotoUrl: string | null;
  cliente: { id: number; nome: string; fotoUrl: string | null };
  etapaAtual: string | null;
  status: StatusCertificacao;
  observacao: string | null;
  atualizadoEm: string;
  totalEtapas: number;
  etapasAprovadas: number;
  progresso: number;
}

export interface MetricasDashboard {
  totalClientes: number;
  totalProdutos: number;
  certificacoesConcluidas: number;
  certificacoesEmAndamento: number;
  certificacoesPendentes: number;
  percentualPendentes: number;
  ultimasAtualizacoes: Array<{
    produtoId: number;
    produto: string;
    cliente: string;
    etapa: string;
    status: StatusCertificacao;
    atualizadoEm: string;
  }>;
}

export interface RespostaPaginada<T> {
  dados: T[];
  total: number;
  pagina: number;
  limite: number;
  totalPaginas: number;
}

/* --------------------------- Aparência do painel -------------------------- */

export type ModoTema = 'CLARO' | 'ESCURO';

/**
 * Espelho de `TokensTemaDto` no backend. Os três últimos são numéricos (px);
 * o resto é cor em hex ou rgb()/rgba().
 */
export interface TokensTema {
  corPrimaria: string;
  corPrimariaEscura: string;
  corSucesso: string;
  corAlerta: string;
  corErro: string;
  corInfo: string;

  fundo: string;
  fundoDegrade: string;
  fundoBrilho1: string;
  fundoBrilho2: string;

  texto: string;
  textoSuave: string;
  textoFraco: string;
  /** Texto do botão primário — não herda `texto`, que inverte com o tema. */
  textoSobrePrimaria: string;

  vidroFundo: string;
  vidroFundoForte: string;
  vidroBorda: string;
  sombraCor: string;
  overlayModal: string;

  vidroBlur: number;
  raio: number;
  raioSm: number;
}

export type AjustePapelParede = 'COBRIR' | 'CONTER' | 'REPETIR';

export interface Aparencia {
  temaClaro: TokensTema;
  temaEscuro: TokensTema;
  /** Id do catálogo em `features/aparencia/fontes.ts`, não a pilha CSS. */
  fonte: string;
  temaPadrao: ModoTema;
  permitirAlternancia: boolean;
  /** Logo do tema claro. Serve de fallback quando a do escuro está vazia. */
  logoTemaClaroUrl: string | null;
  /** Logo do tema escuro. Vazia, cai para a do tema claro. */
  logoTemaEscuroUrl: string | null;
  papelParedeUrl: string | null;
  papelParedeOpacidade: number;
  papelParedeAjuste: AjustePapelParede;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
  /** false = rodando no preset de fábrica, nunca foi salva. */
  personalizada: boolean;
}


/**
 * Agregados dos gráficos (`GET /dashboard/graficos`).
 *
 * Espelha `backend/src/modules/dashboard/graficos.service.ts` — os dois são
 * sincronizados à mão, como o resto deste arquivo. Mudou lá, mude aqui.
 *
 * Vem de um endpoint próprio, e não da listagem, porque as listas são
 * paginadas: um gráfico montado sobre a página visível mostraria 20 registros
 * como se fossem o total, e pareceria correto.
 */
export interface DadosGraficos {
  acompanhamento: {
    etapasPorStatus: Array<{ status: StatusCertificacao; total: number }>;
    ranking: Array<{
      produtoId: number;
      produto: string;
      cliente: string;
      aprovadas: number;
      total: number;
      progresso: number;
    }>;
    totalProdutos: number;
    /** Produtos que não couberam no ranking — some no rodapé do gráfico. */
    foraDoRanking: number;
  };
  certificados: {
    porStatus: Array<{ status: StatusCertificado; total: number }>;
    vencimentos: Array<{ chave: string; rotulo: string; total: number }>;
    totalVigentes: number;
  };
  naoConformidades: {
    porStatus: Array<{
      status: StatusNaoConformidade;
      menor: number;
      maior: number;
      total: number;
    }>;
    porEtapa: Array<{ etapa: string; total: number }>;
    total: number;
  };
}
