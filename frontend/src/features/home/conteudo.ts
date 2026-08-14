/**
 * Conteúdo do site institucional.
 *
 * Os textos vêm do legado (`app/views/home.php`), mantidos palavra por palavra,
 * com apenas duas correções de digitação: "Rua: Rua: John Harrison" → "Rua John
 * Harrison" e "Portifólio" → "Portfólio". Ficam como dados, e não presos ao JSX,
 * para que uma revisão de texto não exija tocar em componente.
 */

export interface ItemIcone {
  icone: string;
  titulo: string;
  texto?: string;
}

export const EMPRESA = {
  nome: 'ProCert',
  chamada: 'Plataforma de certificação de produtos',
  endereco: 'Rua John Harrison, 299 - Lapa, São Paulo - SP, 05074-080',
  enderecoCurto: ['Rua John Harrison, 299', 'Lapa, São Paulo'],
  telefoneContato: '11 94230-7431',
  telefoneRodape: '11 91443-3414',
  email: 'comercial@procertocp.com.br',
  whatsapp: '5511914433414',
  whatsappMensagem:
    'Olá! Gostaria de mais informações sobre a certificação de produtos.',
  desenvolvedor: { nome: 'Single Future', url: 'https://singlefuture.com.br/' },
  /** Embed por endereço: o legado apontava para um lugar de teste ("Trabalho Laisla"). */
  mapaUrl:
    'https://www.google.com/maps?q=Rua+John+Harrison,+299+-+Lapa,+S%C3%A3o+Paulo+-+SP,+05074-080&output=embed',
} as const;

/** Documentos públicos do organismo certificador (menu "Links Úteis"). */
export const DOCUMENTOS: Array<{ rotulo: string; arquivo: string }> = [
  { rotulo: 'Manual da qualidade', arquivo: '/documentos/manual-da-qualidade.pdf' },
  { rotulo: 'Concessão e Manutenção', arquivo: '/documentos/concessao-e-manutencao.pdf' },
  { rotulo: 'Certificação EPIs', arquivo: '/documentos/certificacao-epis.pdf' },
  { rotulo: 'Requisitos EPI Altura', arquivo: '/documentos/requisitos-epi-altura.pdf' },
  {
    rotulo: 'Tratamento de Reclamações e Apelações',
    arquivo: '/documentos/tratamento-reclamacoes-apelacoes.pdf',
  },
  {
    rotulo: 'Política de Imparcialidade',
    arquivo: '/documentos/politica-de-imparcialidade.pdf',
  },
  { rotulo: 'Política e Objetivos', arquivo: '/documentos/politica-e-objetivos.pdf' },
];

export const NAVEGACAO = [
  { rotulo: 'Home', ancora: '#hero' },
  { rotulo: 'Sobre', ancora: '#sobre' },
  { rotulo: 'Serviços', ancora: '#servicos' },
  { rotulo: 'Contato', ancora: '#contato' },
];

export const HERO = {
  titulo: 'Soluções Confiáveis em Certificação com a ProCert',
  subtitulo: 'Especialistas em garantir a conformidade e a qualidade dos seus produtos',
  destaques: [
    { icone: 'bi-shield-check', titulo: 'Certificação de Produtos' },
    { icone: 'bi-clipboard-check', titulo: 'Auditorias Técnicas' },
    { icone: 'bi-archive', titulo: 'Ensaios Laboratoriais' },
    { icone: 'bi-journal-check', titulo: 'Normas e Regulamentos' },
    { icone: 'bi-award', titulo: 'Selo de Qualidade' },
  ] satisfies ItemIcone[],
};

export const SOBRE = {
  titulo: 'Comprometidos com a Qualidade e a Conformidade',
  resumo:
    'A ProCert é um Organismo de Certificação de Produto especializado na certificação de Equipamentos de Proteção Individual (EPIs) e Atuamos com rigor técnico, agilidade e compromisso com a conformidade.',
  itens: [
    'Atuação com base nas principais normas nacionais e internacionais.',
    'Equipe técnica altamente qualificada e multidisciplinar.',
    'Processos transparentes e eficazes, com foco na credibilidade dos resultados.',
  ],
  fechamento:
    'Na ProCert, acreditamos que a certificação vai além de um selo: é a garantia de confiança entre fabricantes, consumidores e o mercado. Nossos serviços promovem segurança, inovação e responsabilidade.',
  imagem: { src: '/img/about.jpg', alt: 'Equipe ProCert realizando auditoria' },
};

export const DIFERENCIAIS = {
  imagem: { src: '/img/services.jpg', alt: 'Laboratório técnico ProCert' },
  itens: [
    {
      icone: 'bi-archive',
      titulo: 'Rigor Técnico e Normativo',
      texto:
        'Seguimos padrões nacionais e internacionais com precisão para garantir conformidade completa dos produtos certificados.',
    },
    {
      icone: 'bi-shield-lock',
      titulo: 'Segurança e Confiabilidade',
      texto:
        'Oferecemos processos seguros e auditáveis, reforçando a credibilidade de cada etapa da certificação.',
    },
    {
      icone: 'bi-broadcast',
      titulo: 'Atendimento Personalizado',
      texto:
        'Adaptamos nossos serviços às necessidades de cada cliente, com suporte técnico próximo e consultivo.',
    },
    {
      icone: 'bi-award',
      titulo: 'Reconhecimento de Mercado',
      texto:
        'Certificações emitidas pela ProCert têm aceitação nacional e internacional, agregando valor ao seu produto.',
    },
  ] satisfies ItemIcone[],
};

export const SERVICOS = {
  rotulo: 'Serviços',
  titulo: 'Conheça as soluções da ProCert',
  itens: [
    {
      icone: 'bi-shield-check',
      titulo: 'Certificação de EPIs',
      texto:
        'Cintos, Talabartes e Trava quedas. Garantimos conformidade com as exigências legais e normas técnicas.',
    },
    {
      icone: 'bi-check-circle',
      titulo: 'Certificação de Produtos',
      texto:
        'Garantimos que seus produtos atendam às normas técnicas e regulatórias exigidas pelos órgãos competentes, com credibilidade e reconhecimento.',
    },
    {
      icone: 'bi-clipboard-data',
      titulo: 'Auditorias e Inspeções',
      texto:
        'Realizamos auditorias técnicas e inspeções periódicas para verificar conformidade com padrões de qualidade, segurança e desempenho.',
    },
    {
      icone: 'bi-journal-check',
      titulo: 'Relatórios Técnicos',
      texto:
        'Emitimos relatórios detalhados com base em análises, ensaios e avaliações para subsidiar processos de certificação e homologação.',
    },
    {
      icone: 'bi-award',
      titulo: 'Selo de Conformidade ProCert',
      texto:
        'Após o processo de certificação, emitimos o selo ProCert, reconhecido no mercado como símbolo de qualidade, segurança e credibilidade.',
    },
  ] satisfies ItemIcone[],
};

export const CHAMADA_ACAO = {
  titulo: 'Precisa Certificar seu Produto?',
  texto:
    'Entre em contato com a ProCert e conte com uma equipe especializada para garantir a conformidade, segurança e qualidade do seu produto com reconhecimento no mercado.',
  botao: 'Fale com um Especialista',
  imagem: {
    src: '/img/cta-bg.jpg',
    alt: 'Profissional da ProCert realizando certificação de produto',
  },
};

export const NUMEROS = {
  titulo: 'Resultados que Comprovam a Confiança na ProCert',
  texto:
    'Com anos de experiência no setor, a ProCert tem sido referência na certificação de produtos, garantindo qualidade, segurança e conformidade técnica em todo o Brasil.',
  imagem: { src: '/img/stats-img.jpg', alt: 'Equipe técnica da ProCert' },
  itens: [
    {
      icone: 'bi-emoji-smile',
      valor: 350,
      titulo: 'Clientes Satisfeitos',
      complemento: 'de diversos setores industriais',
    },
    {
      icone: 'bi-journal-richtext',
      valor: 780,
      titulo: 'Certificações Emitidas',
      complemento: 'em conformidade com normas técnicas',
    },
    {
      icone: 'bi-headset',
      valor: 2500,
      titulo: 'Horas de Suporte',
      complemento: 'técnico e especializado',
    },
    {
      icone: 'bi-people',
      valor: 40,
      titulo: 'Profissionais Qualificados',
      complemento: 'dedicados à excelência em certificação',
    },
  ],
};

export const DEPOIMENTOS = [
  {
    nome: 'Fernando Souza',
    cargo: 'Gerente de Qualidade - Indústria Têxtil',
    foto: '/img/depoimentos/depoimento-1.jpg',
    texto:
      'A ProCert foi essencial no processo de certificação dos nossos produtos. Atendimento ágil, equipe técnica preparada e muita transparência em todas as etapas.',
  },
  {
    nome: 'Bruna Lopes',
    cargo: 'Engenheira Eletricista - Setor Eletrodoméstico',
    foto: '/img/depoimentos/depoimento-2.jpg',
    texto:
      'Graças à certificação com a ProCert, conseguimos acessar novos mercados. O selo ProCert agregou muito valor ao nosso produto.',
  },
  {
    nome: 'Juliana Martins',
    cargo: 'Diretora Comercial - Produtos Hospitalares',
    foto: '/img/depoimentos/depoimento-3.jpg',
    texto:
      'A ProCert tem um diferencial enorme no suporte técnico. Eles realmente entendem do processo e acompanham de perto até a aprovação final.',
  },
  {
    nome: 'Bruno Carvalho',
    cargo: 'Empresário - Produtos Sustentáveis',
    foto: '/img/depoimentos/depoimento-4.jpg',
    texto:
      'A certificação com a ProCert trouxe mais credibilidade e confiança para nossos clientes. Recomendo fortemente.',
  },
  {
    nome: 'Pedro Silva',
    cargo: 'Supervisor Técnico - Cosméticos Naturais',
    foto: '/img/depoimentos/depoimento-5.jpg',
    texto:
      'Além da certificação, a ProCert nos orientou sobre adequações técnicas e melhorias no processo. Um verdadeiro parceiro estratégico.',
  },
];

export const CONTATO = {
  rotulo: 'Contato',
  titulo: 'Fale Conosco',
  informacoes: [
    { icone: 'bi-geo-alt', titulo: 'Endereço', texto: EMPRESA.endereco },
    { icone: 'bi-telephone', titulo: 'Nosso Número', texto: EMPRESA.telefoneContato },
    { icone: 'bi-envelope', titulo: 'Nosso Email', texto: EMPRESA.email },
  ] satisfies ItemIcone[],
};

export const REDES_SOCIAIS = [
  { icone: 'bi-twitter-x', rotulo: 'X', url: '' },
  { icone: 'bi-facebook', rotulo: 'Facebook', url: '' },
  { icone: 'bi-instagram', rotulo: 'Instagram', url: '' },
  { icone: 'bi-linkedin', rotulo: 'LinkedIn', url: '' },
];
