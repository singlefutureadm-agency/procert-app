/**
 * Conteúdo das páginas institucionais dedicadas (/sobre, /servicos, /contato).
 *
 * Por que páginas, e não as âncoras da home: uma página única concentra todos
 * os termos numa só URL, e o buscador precisa escolher um trecho para responder
 * "certificação de EPI para trabalho em altura". Separando, cada URL disputa o
 * próprio conjunto de termos, ganha título e descrição próprios, e passa a ter
 * para onde apontar link interno.
 *
 * ---
 *
 * LIMITE DELIBERADO — leia antes de acrescentar texto aqui.
 *
 * Nada neste arquivo afirma que a ProCert é acreditada pelo Inmetro/Cgcre, que
 * opera no âmbito do SBAC, que possui escopo acreditado para uma norma
 * específica, ou que emite Certificado de Aprovação (o CA é expedido pelo
 * Ministério do Trabalho, não por um OCP). Essas são declarações com efeito
 * regulatório: se forem falsas, o dano não é de marketing.
 *
 * O texto descreve o PROCESSO de avaliação da conformidade — que é público,
 * verdadeiro para o setor e onde estão os termos de busca — e as famílias de
 * produto que o próprio site já declarava. Havendo confirmação documental do
 * cliente sobre acreditação e escopo, o lugar de declarar é aqui e em
 * `hasCredential` no JSON-LD de `lib/seo.ts`.
 */

/** Itens de navegação do site. Fonte única do menu, do rodapé e do sitemap. */
export const PAGINAS = [
  { rotulo: 'Início', caminho: '/' },
  { rotulo: 'Sobre', caminho: '/sobre' },
  { rotulo: 'Serviços', caminho: '/servicos' },
  { rotulo: 'Contato', caminho: '/contato' },
] as const;

export interface BlocoTexto {
  titulo: string;
  paragrafos: string[];
}

export interface CartaoIcone {
  icone: string;
  titulo: string;
  texto: string;
}

export interface PerguntaFrequente {
  pergunta: string;
  resposta: string;
}

export interface HeroPagina {
  /** Sobrelinha curta acima do H1 — situa a página sem roubar o H1. */
  rotulo: string;
  titulo: string;
  subtitulo: string;
}

// ---------------------------------------------------------------- /servicos

export const SERVICOS_PAGINA = {
  seo: {
    titulo: 'Certificação de EPI e de produtos | ProCert Certificação',
    descricao:
      'Certificação de equipamentos de proteção individual para trabalho em altura — cinturões, talabartes e trava-quedas —, auditoria de fábrica, ensaios e emissão de certificado. Conheça as etapas do processo.',
  },
  hero: {
    rotulo: 'Serviços',
    titulo: 'Certificação de produtos e equipamentos de proteção individual',
    subtitulo:
      'Da análise documental à emissão do certificado, com acompanhamento técnico em cada etapa.',
  } satisfies HeroPagina,

  introducao: {
    titulo: 'O que a ProCert faz',
    paragrafos: [
      'A ProCert é um Organismo de Certificação de Produto (OCP) dedicado à avaliação da conformidade de equipamentos de proteção individual e de produtos industriais. Nosso trabalho é verificar, com método e evidência, que um produto atende aos requisitos técnicos que se propõe a atender — e registrar essa verificação de forma auditável.',
      'Certificar um produto não é emitir um documento no fim de uma fila. É um processo de avaliação que combina análise de documentação técnica, ensaios em laboratório, verificação do processo produtivo e uma decisão fundamentada. Cada uma dessas etapas gera evidência, e é a evidência que sustenta o certificado.',
    ],
  } satisfies BlocoTexto,

  /**
   * Serviços em detalhe. `pontos` existe para o texto não virar um parágrafo
   * corrido: quem chega por busca lê em diagonal antes de decidir ler inteiro.
   */
  detalhados: [
    {
      icone: 'bi-shield-check',
      titulo: 'Certificação de EPI para trabalho em altura',
      texto:
        'Avaliação da conformidade de equipamentos de proteção individual contra quedas, incluindo cinturões de segurança tipo paraquedista, talabartes de posicionamento e segurança, e dispositivos trava-quedas. São produtos em que a falha tem consequência direta sobre a vida do trabalhador, e o processo de avaliação reflete isso.',
      pontos: [
        'Cinturões de segurança tipo paraquedista',
        'Talabartes de segurança e de posicionamento',
        'Dispositivos trava-quedas retráteis e guiados',
        'Conectores, mosquetões e acessórios',
      ],
    },
    {
      icone: 'bi-check-circle',
      titulo: 'Certificação de produtos industriais',
      texto:
        'Verificação de que o produto atende às normas técnicas e aos requisitos regulatórios aplicáveis à sua família. O escopo é definido caso a caso, a partir da norma aplicável, do uso pretendido e do risco associado ao produto.',
      pontos: [
        'Análise da documentação técnica e do memorial descritivo',
        'Definição do escopo e do plano de avaliação',
        'Acompanhamento até a decisão de certificação',
      ],
    },
    {
      icone: 'bi-clipboard-data',
      titulo: 'Auditoria de fábrica e inspeção',
      texto:
        'A conformidade de uma amostra não garante a conformidade da produção. A auditoria de fábrica avalia o processo produtivo e o controle da qualidade do fabricante, verificando se ele é capaz de reproduzir de forma consistente o produto que foi ensaiado.',
      pontos: [
        'Avaliação do processo produtivo',
        'Verificação do controle da qualidade',
        'Inspeções periódicas de manutenção',
        'Registro de não conformidades com prazo de tratativa',
      ],
    },
    {
      icone: 'bi-journal-check',
      titulo: 'Ensaios e relatórios técnicos',
      texto:
        'Coordenação dos ensaios previstos para a família do produto e emissão de relatórios técnicos que registram método, condição e resultado. O relatório é o documento que sustenta a decisão de certificação e acompanha o produto ao longo da manutenção.',
      pontos: [
        'Definição dos ensaios aplicáveis',
        'Registro de método, condições e resultados',
        'Documentação rastreável por etapa do processo',
      ],
    },
    {
      icone: 'bi-award',
      titulo: 'Emissão e manutenção do certificado',
      texto:
        'Aprovadas todas as etapas obrigatórias, o certificado é emitido com número sequencial, escopo declarado e prazo de validade. A certificação não termina aí: ela é mantida por avaliações periódicas, e o vencimento é acompanhado ao longo de todo o ciclo.',
      pontos: [
        'Certificado com número sequencial e validade definida',
        'Portal do cliente para acompanhar o processo',
        'Acompanhamento de vencimento e recertificação',
      ],
    },
  ],

  /**
   * As etapas espelham a trilha real do sistema (ver `schema.prisma`:
   * ModeloEtapa / CertificacaoProduto). Descrever o processo que a plataforma
   * de fato executa é o conteúdo mais difícil de um concorrente copiar, e o
   * que melhor responde à busca "como certificar um produto".
   */
  processo: {
    titulo: 'Como funciona o processo de certificação',
    texto:
      'Cada família de produto tem sua própria trilha de avaliação, definida antes do início do processo e registrada em versão. Um produto submetido é avaliado pelas regras vigentes na submissão — publicar uma versão nova da trilha não altera processos em andamento.',
    etapas: [
      {
        numero: '01',
        titulo: 'Análise documental',
        texto:
          'Conferência da documentação técnica do produto, do memorial descritivo e dos dados do fabricante. É aqui que se define o escopo da avaliação e se identificam pendências antes de qualquer ensaio — o que evita descobrir um problema de documentação depois do custo de laboratório.',
      },
      {
        numero: '02',
        titulo: 'Ensaios laboratoriais',
        texto:
          'Execução dos ensaios previstos para a família do produto, com registro de método, condições e resultados. Cada ensaio gera evidência anexada à etapa correspondente do processo.',
      },
      {
        numero: '03',
        titulo: 'Auditoria de fábrica',
        texto:
          'Avaliação do processo produtivo e do sistema de controle da qualidade do fabricante, para verificar a capacidade de reproduzir de forma consistente o produto avaliado.',
      },
      {
        numero: '04',
        titulo: 'Decisão e emissão',
        texto:
          'Análise crítica do conjunto de evidências e decisão sobre a certificação. Aprovadas as etapas obrigatórias, o certificado é emitido com escopo e validade. Reprovação em qualquer etapa abre uma não conformidade com prazo de resposta, e a etapa é reavaliada após a tratativa.',
      },
      {
        numero: '05',
        titulo: 'Manutenção',
        texto:
          'A certificação é acompanhada ao longo da validade por avaliações periódicas. O vencimento é monitorado e o cliente é avisado com antecedência para que a recertificação não interrompa a comercialização.',
      },
    ],
  },

  faq: [
    {
      pergunta: 'Quanto tempo leva para certificar um produto?',
      resposta:
        'O prazo depende da família do produto, do número de ensaios previstos e, principalmente, da qualidade da documentação apresentada na primeira etapa. Processos que chegam com documentação técnica completa avançam sensivelmente mais rápido, porque a análise documental deixa de gerar pendências que travam as etapas seguintes. O escopo e o prazo estimado são definidos na abertura do processo.',
    },
    {
      pergunta: 'Quais documentos preciso reunir antes de começar?',
      resposta:
        'Em geral: memorial descritivo do produto, desenhos e especificações técnicas, dados do fabricante e do processo produtivo, e a identificação da norma ou do requisito aplicável. A lista exata varia com a família do produto e é definida na análise documental.',
    },
    {
      pergunta: 'O que acontece se o produto for reprovado em alguma etapa?',
      resposta:
        'A reprovação abre uma não conformidade, com descrição do que foi encontrado e prazo para resposta. O cliente apresenta a tratativa, a equipe avalia, e a etapa volta a ser avaliada — ela não é aprovada automaticamente por causa da resposta. Todo o histórico fica registrado, com autoria e data.',
    },
    {
      pergunta: 'Qual a validade do certificado?',
      resposta:
        'A validade é definida pela categoria do produto e consta no próprio certificado. Durante esse período a certificação é mantida por avaliações periódicas, e o vencimento é acompanhado para que a recertificação seja iniciada com antecedência.',
    },
    {
      pergunta: 'Consigo acompanhar o andamento do processo?',
      resposta:
        'Sim. Cada cliente tem acesso a um portal onde vê a situação de cada etapa da trilha do seu produto, os documentos enviados, as não conformidades abertas e os certificados emitidos, com histórico de quem alterou o quê e quando.',
    },
  ] satisfies PerguntaFrequente[],
};

// ------------------------------------------------------------------- /sobre

export const SOBRE_PAGINA = {
  seo: {
    titulo: 'Sobre a ProCert | Organismo de Certificação de Produto',
    descricao:
      'A ProCert é um Organismo de Certificação de Produto especializado em equipamentos de proteção individual. Conheça nossa atuação, princípios técnicos e compromisso com a imparcialidade.',
  },
  hero: {
    rotulo: 'Sobre a ProCert',
    titulo: 'Um organismo de certificação construído sobre evidência',
    subtitulo:
      'Certificação de produto com rigor técnico, imparcialidade e rastreabilidade em cada decisão.',
  } satisfies HeroPagina,

  quemSomos: {
    titulo: 'Quem somos',
    paragrafos: [
      'A ProCert é um Organismo de Certificação de Produto (OCP) especializado na certificação de Equipamentos de Proteção Individual, com atuação voltada a produtos de proteção contra quedas — cinturões de segurança, talabartes e dispositivos trava-quedas. Atendemos fabricantes e importadores em todo o Brasil.',
      'Certificação de produto é, no fundo, uma questão de confiança entre partes que não se conhecem: um comprador que não visitou a fábrica, um trabalhador que não leu o relatório de ensaio, um fiscal que não acompanhou a produção. O papel de um organismo de certificação é ser o terceiro que verificou — e cuja verificação pode ser auditada.',
      'É por isso que nosso processo é construído em torno de evidência, e não de parecer. Cada etapa da avaliação registra o que foi verificado, por quem e quando; cada reprovação gera uma não conformidade rastreável; cada certificado emitido tem um histórico completo por trás.',
    ],
  } satisfies BlocoTexto,

  /**
   * Os três primeiros são princípios estruturais de um OCP (ABNT NBR ISO/IEC
   * 17065 os trata como requisito), e não slogan. Descritos como prática, não
   * como certificação obtida — ver o LIMITE no topo do arquivo.
   */
  principios: [
    {
      icone: 'bi-circle-half',
      titulo: 'Imparcialidade',
      texto:
        'A decisão de certificação não pode depender de interesse comercial. Estruturamos o processo para que quem avalia a evidência não seja quem negocia o contrato, e mantemos registro das decisões para que possam ser revistas.',
    },
    {
      icone: 'bi-file-lock',
      titulo: 'Confidencialidade',
      texto:
        'Documentação técnica de produto é ativo estratégico do fabricante. O acesso é restrito por perfil, e o cliente só enxerga os próprios processos — regra aplicada no servidor, não apenas na interface.',
    },
    {
      icone: 'bi-diagram-3',
      titulo: 'Rastreabilidade',
      texto:
        'Toda alteração em um processo de certificação fica registrada com autoria e data. Um certificado emitido pode ser reconstituído etapa por etapa, inclusive anos depois.',
    },
    {
      icone: 'bi-people',
      titulo: 'Equipe técnica',
      texto:
        'Avaliação de conformidade depende de quem lê o relatório. Nossa equipe é multidisciplinar e acompanha o cliente de forma consultiva, do escopo inicial à manutenção da certificação.',
    },
  ] satisfies CartaoIcone[],

  comoTrabalhamos: {
    titulo: 'Como trabalhamos',
    paragrafos: [
      'Cada família de produto tem uma trilha de avaliação própria, definida e versionada antes de qualquer processo começar. Isso significa que dois produtos da mesma família são avaliados pelos mesmos critérios, e que uma mudança de critério não altera retroativamente processos já em andamento.',
      'O cliente acompanha tudo por um portal próprio: em que etapa está cada produto, quais documentos foram enviados, quais não conformidades estão abertas e qual o prazo de resposta. A alternativa — descobrir o andamento por telefone — transforma o processo numa caixa preta, e é justamente essa opacidade que a certificação existe para combater.',
    ],
  } satisfies BlocoTexto,
};

// ----------------------------------------------------------------- /contato

export const CONTATO_PAGINA = {
  seo: {
    titulo: 'Contato | ProCert Certificação de Produtos',
    descricao:
      'Fale com a equipe técnica da ProCert sobre certificação de EPI e de produtos. Atendimento por telefone, e-mail e WhatsApp. Escritório na Lapa, São Paulo.',
  },
  hero: {
    rotulo: 'Contato',
    titulo: 'Fale com a equipe técnica',
    subtitulo:
      'Conte o que você precisa certificar e retornamos com o escopo e os próximos passos.',
  } satisfies HeroPagina,

  introducao: {
    titulo: 'Antes de enviar',
    paragrafos: [
      'Quanto mais específica a mensagem, mais útil o retorno. Se puder, diga qual é o produto, para que uso ele é destinado e se já existe alguma norma ou requisito de referência — com isso conseguimos indicar o escopo provável da avaliação já no primeiro contato, em vez de gastar uma rodada só para descobrir do que se trata.',
    ],
  } satisfies BlocoTexto,

  faq: [
    {
      pergunta: 'Vocês atendem fora de São Paulo?',
      resposta:
        'Sim. Atendemos fabricantes e importadores em todo o Brasil. A etapa de auditoria de fábrica ocorre no local de produção; as demais são conduzidas de forma remota, com envio de documentação e acompanhamento pelo portal do cliente.',
    },
    {
      pergunta: 'Já sou cliente e quero acompanhar meu processo.',
      resposta:
        'O acompanhamento é feito pela área do cliente, com o login enviado na abertura do processo. Lá ficam a situação de cada etapa, os documentos, as não conformidades e os certificados emitidos.',
    },
    {
      pergunta: 'Em quanto tempo vocês respondem?',
      resposta:
        'Mensagens enviadas pelo formulário chegam à equipe comercial em horário comercial. Para assuntos urgentes de processo em andamento, o canal mais rápido é o WhatsApp.',
    },
  ] satisfies PerguntaFrequente[],
};
