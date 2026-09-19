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

/** Referência enxuta a um colaborador (GET /funcionarios/resumo). */
export interface FuncionarioResumo {
  id: number;
  nome: string;
  email: string;
  role: Exclude<Role, 'CLIENTE'>;
}

export interface Cliente extends PessoaBase {
  /**
   * Funcionário responsável pela carteira desta empresa.
   *
   * **Informativo: não restringe acesso.** Todo funcionário continua vendo
   * todos os clientes; o campo diz quem responde pela empresa, não quem pode
   * abri-la.
   */
  responsavelId: number | null;
  responsavel: { id: number; nome: string } | null;
}

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

/**
 * Papel FUNCIONAL na execução do processo — de quem é a etapa no fluxo.
 *
 * **Não confundir com `Role`.** `Role` (ADMIN/FUNCIONARIO/CLIENTE) decide o que
 * a pessoa alcança no sistema; este decide quem executa a etapa. Nada aqui
 * concede ou restringe acesso, e nenhuma tela deve tratá-lo como permissão.
 */
export type PapelFuncional =
  | 'CLIENTE'
  | 'TECNICO'
  | 'QUALIDADE'
  | 'AUDITOR'
  | 'DIRETORIA';

/** Bloco do pipeline a que a etapa pertence — as colunas do quadro. */
export type FaseProcesso =
  | 'ABERTURA'
  | 'AMOSTRAGEM_AUDITORIA'
  | 'ENSAIOS_LABORATORIO'
  | 'ANALISE_PROCESSO'
  | 'EMISSAO';

/** Por que o processo foi aberto. */
export type MotivoProcesso =
  | 'INICIAL'
  | 'RENOVACAO'
  | 'RECERTIFICACAO'
  | 'MANUTENCAO'
  | 'TRANSFERENCIA'
  | 'EXTENSAO_ESCOPO';

/**
 * Item de checklist definido na trilha. É a DEFINIÇÃO — o que se marca é a
 * cópia que o processo recebe (`MicroEtapaCertificacao`).
 */
export interface ModeloMicroEtapa {
  id: number;
  nome: string;
  ordem: number;
  /** Área do ITEM. `null` = a mesma da etapa, não "ninguém". */
  papelResponsavel: PapelFuncional | null;
  /** Prazo do ITEM, em horas. Independente do prazo da etapa. */
  prazoSlaHoras: number | null;
}

/** Item de checklist DE UM PROCESSO. É este que se marca. */
export interface MicroEtapaCertificacao {
  id: number;
  nome: string;
  ordem: number;
  papelResponsavel: PapelFuncional | null;
  prazoSlaHoras: number | null;
  concluida: boolean;
  concluidaEm: string | null;
  concluidaPorNome: string | null;
}

/** Etapa prevista por uma versão de trilha. */
export interface ModeloEtapa {
  id: number;
  modeloTrilhaId: number;
  nome: string;
  descricao: string | null;
  ordem: number;
  tipo: TipoEtapa;
  obrigatoria: boolean;
  papelResponsavel: PapelFuncional | null;
  fase: FaseProcesso;
  /** Prazo alvo em HORAS. Exiba sempre por `formatarPrazoSla`. */
  prazoSlaHoras: number | null;
  exigeDocumento: boolean;
  /** Checklist previsto pela trilha. Vazio = etapa sem checklist. */
  microEtapas: ModeloMicroEtapa[];
}

/** Um item de checklist na escrita da trilha. */
export interface MicroEtapaEntrada {
  nome: string;
  papelResponsavel?: PapelFuncional;
  prazoSlaHoras?: number;
}

/** Payload de escrita de etapa (sem id/ordem: a ordem vem da posição na lista). */
export interface EtapaModeloEntrada {
  nome: string;
  descricao?: string;
  tipo?: TipoEtapa;
  obrigatoria?: boolean;
  papelResponsavel?: PapelFuncional;
  fase?: FaseProcesso;
  prazoSlaHoras?: number;
  exigeDocumento?: boolean;
  /** Checklist da etapa, na ordem. A ordem vem da posição na lista. */
  microEtapas?: MicroEtapaEntrada[];
}

export interface ModeloTrilha {
  id: number;
  trilhaId: number;
  versao: number;
  ativo: boolean;
  /** Padrão do processo: fechar o checklist de uma etapa a aprova sozinha. */
  aprovacaoAutomatica: boolean;
  vigenteDe: string;
  vigenteAte: string | null;
  criadoEm: string;
  etapas: ModeloEtapa[];
  totalProcessos: number;
  /** Versão sem processos vinculados ainda aceita edição direta das etapas. */
  editavel: boolean;
}

export interface ResumoModeloVigente {
  id: number;
  versao: number;
  vigenteDe?: string;
  totalEtapas: number;
  totalProcessos?: number;
}

/** Trilha do catálogo vista de dentro de uma categoria. */
export interface TrilhaVinculada {
  id: number;
  nome: string;
  status: StatusRegistro;
}

export interface CategoriaProcesso {
  id: number;
  nome: string;
  /** Abreviação usada no código do processo (`PROCERT-<SIGLA>-<NNN>-<AA>`). */
  sigla: string | null;
  descricao: string | null;
  normaReferencia: string | null;
  validadeMeses: number;
  status: StatusRegistro;
  criadoEm: string;
  atualizadoEm: string;
  trilhaId: number | null;
  totalProcessos: number;
  /** Trilha do catálogo que esta categoria segue. */
  trilha: TrilhaVinculada | null;
  /** Versões da TRILHA vinculada — 0 quando não há trilha. */
  totalVersoes: number;
  modeloVigente: ResumoModeloVigente | null;
}

/** Item do select de categorias no cadastro de processo. */
export interface CategoriaResumo {
  id: number;
  nome: string;
  normaReferencia: string | null;
  trilha: { id: number; nome: string } | null;
  modeloVigente: { id: number; versao: number; totalEtapas: number } | null;
}

/** Uma versão dentro do payload da trilha — sem as etapas, que vêm no detalhe. */
export interface ResumoVersaoTrilha {
  id: number;
  versao: number;
  ativo: boolean;
  vigenteDe: string;
  vigenteAte: string | null;
  totalEtapas: number;
  totalProcessos: number;
  editavel: boolean;
}

/** Categoria vista de dentro de uma trilha do catálogo. */
export interface CategoriaVinculada {
  id: number;
  nome: string;
  status: StatusRegistro;
}

/**
 * Trilha do catálogo — a FAMÍLIA, reutilizável por várias categorias.
 * O processo em si vive nas `versoes` (`ModeloTrilha`).
 */
export interface Trilha {
  id: number;
  nome: string;
  descricao: string | null;
  status: StatusRegistro;
  criadoEm: string;
  atualizadoEm: string;
  categorias: CategoriaVinculada[];
  totalCategorias: number;
  totalVersoes: number;
  /** Soma de TODAS as versões, não só da vigente. */
  totalProcessos: number;
  modeloVigente: ResumoModeloVigente | null;
  versoes: ResumoVersaoTrilha[];
}

/** Item do select de vínculo de trilha na categoria. */
export interface TrilhaResumo {
  id: number;
  nome: string;
  modeloVigente: { id: number; versao: number; totalEtapas: number } | null;
}

export interface SituacaoVersaoTrilha {
  atualizado: boolean;
  /**
   * Nome da trilha de cada lado.
   *
   * Trilhas diferentes numeram versões de forma independente, então
   * `versaoProcesso` e `versaoVigente` podem ser ambas 1 e ainda assim descrever
   * processos distintos — acontece quando a categoria troca de trilha. Só o
   * nome desambigua.
   */
  trilhaProcesso: string;
  trilhaVigente: string;
  versaoProcesso: number;
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

export interface Processo {
  id: number;
  clienteId: number;
  categoriaId: number;
  modeloTrilhaId: number;
  /** `PROCERT-EPI-012-26`. Null em processo anterior à mudança e em categoria sem sigla. */
  codigoProcesso: string | null;
  motivoProcesso: MotivoProcesso;
  /**
   * Aprovação da etapa ao fechar o checklist. `null` = HERDA a versão da
   * trilha; `true`/`false` sobrepõem só neste processo.
   */
  aprovacaoAutomatica: boolean | null;
  nome: string;
  descricao: string | null;
  preco: number;
  fotoUrl: string | null;
  status: StatusRegistro;
  criadoEm: string;
  atualizadoEm: string;
  cliente: { id: number; nome: string; fotoUrl: string | null };
  categoria: { id: number; nome: string; normaReferencia: string | null };
  /**
   * A VERSÃO da trilha que o processo carrega como retrato, com a família a que
   * ela pertence. O `trilha` já vinha do servidor e faltava aqui — sem ele não
   * havia como linkar do processo para o modelo que o gerou.
   */
  modeloTrilha: {
    id: number;
    versao: number;
    ativo: boolean;
    trilha: { id: number; nome: string };
  };
  certificacao: Array<{
    id: number;
    /** Posição na trilha do processo. */
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
  processoId: number;
  numero: string;
  escopo: string;
  dataEmissao: string;
  dataValidade: string;
  status: StatusCertificado;
  motivoStatus: string | null;
  emitidoPorNome: string;
  arquivoPdf: string | null;
  criadoEm: string;
  processo: {
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

/** NC com o contexto da etapa e do processo — usado na listagem dedicada. */
export interface NaoConformidadeDetalhada extends NaoConformidade {
  certificacaoId: number;
  certificacao: {
    id: number;
    status: StatusCertificacao;
    ordem: number;
    etapa: { id: number; nome: string };
    processo: {
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
  /** Posição na trilha do processo (não a do modelo, que pode colidir). */
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
    papelResponsavel: PapelFuncional | null;
    fase: FaseProcesso;
    prazoSlaHoras: number | null;
  };
  /** Checklist DESTE processo nesta etapa. É o que se marca. */
  microEtapas: MicroEtapaCertificacao[];
  naoConformidades: NaoConformidade[];
  historico: HistoricoCertificacao[];
}

export interface CertificacaoDetalhe {
  processo: {
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
  processoId: number;
  processo: string;
  processoFotoUrl: string | null;
  cliente: { id: number; nome: string; fotoUrl: string | null };
  etapaAtual: string | null;
  status: StatusCertificacao;
  observacao: string | null;
  atualizadoEm: string;
  totalEtapas: number;
  etapasAprovadas: number;
  progresso: number;
}

// ------------------------- Quadro de processos ----------------------------

/**
 * Semáforo de aging. `null` no cartão concluído — ausência de sinal, que é
 * diferente de VERDE: verde afirmaria "dentro do prazo", e um processo
 * encerrado não está dentro nem fora de prazo nenhum.
 */
export type SemaforoAging = 'VERDE' | 'AMARELO' | 'VERMELHO';

/** Colunas do quadro: as fases do pipeline, mais a coluna derivada do fim. */
export type ColunaQuadro = FaseProcesso | 'CONCLUIDO' | 'CANCELADO';

/**
 * Situação do prazo da etapa atual — TRÊS estados, e a tela precisa dos três.
 *
 * `SEM_PRAZO` e `NAO_INICIADA` não são a mesma coisa: a primeira é "não há o
 * que cobrar", a segunda é "há prazo e ninguém começou" — processo parado na
 * fila, que é o que o quadro existe para mostrar. Renderizá-los com o mesmo
 * "—" faz o segundo desaparecer.
 *
 * Discriminada por `situacao` para o `switch` da tela ser exaustivo: estado
 * novo no backend vira erro de type-check aqui, não um cartão em branco.
 */
export type SituacaoSla =
  | { situacao: 'SEM_PRAZO' }
  | { situacao: 'NAO_INICIADA'; prazoHoras: number }
  | {
      situacao: 'EM_CONTAGEM';
      prazoHoras: number;
      limiteEm: string;
      /** Negativo quando o prazo já passou. */
      horasRestantes: number;
      estourado: boolean;
    };

export interface CartaoQuadro {
  processoId: number;
  codigoProcesso: string | null;
  processo: string;
  motivoProcesso: MotivoProcesso;
  cliente: { id: number; nome: string };
  categoria: { id: number; nome: string };
  etapaAtual: {
    id: number;
    nome: string;
    status: StatusCertificacao;
    papelResponsavel: PapelFuncional | null;
  } | null;
  totalEtapas: number;
  etapasAprovadas: number;
  progresso: number;
  /**
   * Dias entre a submissão e hoje — ou entre a submissão e a conclusão, se o
   * processo terminou. **O relógio para ao concluir**, senão todo processo
   * antigo viraria vermelho e o semáforo perderia o sentido.
   */
  diasEmAberto: number;
  concluido: boolean;
  /** Processo interrompido. `null` = em andamento. Precede a fase. */
  cancelamento: { em: string; motivo: string | null; por: string | null } | null;
  /** Checklist da ETAPA ATUAL. `total: 0` = etapa sem checklist. */
  checklist: { concluidas: number; total: number };
  semaforo: SemaforoAging | null;
  sla: SituacaoSla;
  naoConformidadesAbertas: number;
}

export interface ColunaDoQuadro {
  fase: ColunaQuadro;
  /** Contagem REAL da coluna, independente de quantos cartões vieram. */
  total: number;
  cartoes: CartaoQuadro[];
}

export interface QuadroProcessos {
  colunas: ColunaDoQuadro[];
  limitePorFase: number;
  limiares: { amarelo: number; vermelho: number };
}

export interface MetricasDashboard {
  totalClientes: number;
  totalProcessos: number;
  certificacoesConcluidas: number;
  certificacoesEmAndamento: number;
  certificacoesPendentes: number;
  percentualPendentes: number;
  ultimasAtualizacoes: Array<{
    processoId: number;
    processo: string;
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
      processoId: number;
      processo: string;
      cliente: string;
      aprovadas: number;
      total: number;
      progresso: number;
    }>;
    totalProcessos: number;
    /** Processos que não couberam no ranking — some no rodapé do gráfico. */
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
