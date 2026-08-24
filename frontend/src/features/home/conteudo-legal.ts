/**
 * Textos dos documentos legais do site institucional.
 *
 * Ficam como dados pelo mesmo motivo de `conteudo.ts`: revisão jurídica é
 * frequente e não deve exigir tocar em componente. O texto foi mantido palavra
 * por palavra como fornecido pelo cliente — **não reescreva** sem pedir: aqui
 * a redação tem efeito legal, ao contrário do texto de marketing da home.
 *
 * `**duplo asterisco**` marca negrito e é resolvido por `comDestaques()` em
 * `PaginaLegal.tsx`. É o mínimo de marcação que evita quebrar os parágrafos em
 * fragmentos de JSX só para grifar uma razão social.
 */

/** Identificação da empresa, repetida ao pé dos dois documentos. */
export const EMPRESA_LEGAL = {
  razaoSocial: 'PROCERT CERTIFICAÇÃO DE PRODUTOS LTDA',
  cnpj: '61.926.893/0001-95',
  endereco:
    'Rua John Harrison, 299, Conj. 902, Cond. Now Offices, Lapa, São Paulo/SP, CEP 05074-080',
} as const;

export interface SecaoLegal {
  /** Numeração + título, como no documento original ("1. Dados coletados"). */
  titulo: string;
  paragrafos?: string[];
  itens?: string[];
}

export interface DocumentoLegal {
  /** Título da página e do <title> do documento. */
  titulo: string;
  /** Linha de apoio sobre o título, no topo escuro. */
  subtitulo: string;
  atualizadoEm: string;
  abertura: string[];
  secoes: SecaoLegal[];
  /** Parágrafo solto ao final, depois da identificação. */
  fecho?: string;
}

const IDENTIFICACAO: SecaoLegal = {
  titulo: 'Identificação',
  paragrafos: [
    `**${EMPRESA_LEGAL.razaoSocial}**`,
    `**CNPJ:** ${EMPRESA_LEGAL.cnpj}`,
    `**Endereço:** ${EMPRESA_LEGAL.endereco}`,
  ],
};

export const POLITICA_PRIVACIDADE: DocumentoLegal = {
  titulo: 'Política de Privacidade',
  subtitulo: 'Notificações via WhatsApp',
  atualizadoEm: '20 de agosto de 2026',
  abertura: [
    `A **${EMPRESA_LEGAL.razaoSocial}**, inscrita no CNPJ nº **${EMPRESA_LEGAL.cnpj}**, respeita a privacidade de seus clientes e utiliza seus dados pessoais apenas para as finalidades necessárias à prestação de seus serviços.`,
  ],
  secoes: [
    {
      titulo: '1. Dados coletados',
      paragrafos: [
        'Para o envio das notificações via WhatsApp, poderão ser utilizados:',
      ],
      itens: [
        'Nome;',
        'Número de telefone;',
        'Número ou identificação do processo de certificação;',
        'Informações relacionadas ao status do certificado.',
      ],
    },
    {
      titulo: '2. Finalidade',
      paragrafos: ['Os dados serão utilizados para:'],
      itens: [
        'Identificar o cliente;',
        'Enviar atualizações sobre o processo de certificação;',
        'Informar pendências;',
        'Comunicar a conclusão ou emissão do certificado.',
      ],
    },
    {
      titulo: '3. WhatsApp e Meta',
      paragrafos: [
        'As notificações são enviadas por meio da plataforma **WhatsApp Business**, disponibilizada pela **Meta**.',
        'O número de telefone e as informações necessárias para o envio das mensagens poderão ser processados pela Meta e pelos sistemas utilizados pela PROCERT para disponibilização do serviço.',
      ],
    },
    {
      titulo: '4. Proteção dos dados',
      paragrafos: [
        'A PROCERT adota medidas de segurança para proteger os dados pessoais contra acesso, alteração ou utilização não autorizada.',
        'Os dados não serão utilizados para finalidades diferentes das informadas nesta Política, salvo quando houver obrigação legal ou outra base legal prevista na legislação.',
      ],
    },
    {
      titulo: '5. Direitos do usuário',
      paragrafos: [
        'O usuário possui os direitos previstos na **Lei Geral de Proteção de Dados (LGPD)**, incluindo solicitar informações sobre o tratamento de seus dados, correção de dados incorretos e, quando aplicável, exclusão ou interrupção do tratamento.',
      ],
    },
    {
      titulo: '6. Contato',
      paragrafos: [
        'Para assuntos relacionados a este serviço, o usuário poderá utilizar os canais oficiais de atendimento da PROCERT.',
      ],
    },
    { ...IDENTIFICACAO, titulo: '7. Identificação' },
  ],
  fecho: 'Esta Política poderá ser atualizada sempre que necessário.',
};

export const TERMOS_DE_USO: DocumentoLegal = {
  titulo: 'Termos de Uso',
  subtitulo: 'Notificações via WhatsApp',
  atualizadoEm: '21 de agosto de 2026',
  abertura: [
    `A **${EMPRESA_LEGAL.razaoSocial}**, inscrita no CNPJ nº **${EMPRESA_LEGAL.cnpj}**, utiliza o WhatsApp como canal de comunicação para informar seus clientes sobre o andamento dos processos de certificação.`,
    'Ao fornecer seu número de telefone e utilizar este canal, o usuário concorda com os seguintes termos:',
  ],
  secoes: [
    {
      titulo: '1. Finalidade',
      paragrafos: [
        'O WhatsApp será utilizado exclusivamente para enviar informações relacionadas ao processo de certificação, incluindo:',
      ],
      itens: [
        'Atualizações sobre o status do certificado;',
        'Informações sobre pendências;',
        'Avisos sobre alterações no processo;',
        'Comunicação sobre a conclusão ou emissão do certificado.',
      ],
    },
    {
      titulo: '2. Uso do número de telefone',
      paragrafos: [
        'O número informado será utilizado para realizar as comunicações relacionadas ao processo de certificação.',
        'O usuário é responsável por fornecer um número correto e atualizado.',
      ],
    },
    {
      titulo: '3. Mensagens automáticas',
      paragrafos: [
        'As mensagens poderão ser enviadas automaticamente pelo sistema da PROCERT, conforme as alterações realizadas no processo de certificação.',
      ],
    },
    {
      titulo: '4. Cancelamento',
      paragrafos: [
        'O usuário poderá solicitar a interrupção das notificações pelo WhatsApp.',
        'A interrupção das mensagens não cancela ou interrompe o processo de certificação.',
      ],
    },
    {
      titulo: '5. Privacidade',
      paragrafos: [
        'O tratamento dos dados pessoais será realizado de acordo com a **Política de Privacidade da PROCERT** e com a **Lei Geral de Proteção de Dados (LGPD)**.',
      ],
    },
    { ...IDENTIFICACAO, titulo: '6. Identificação' },
  ],
  fecho:
    'Ao utilizar o serviço de notificações, o usuário declara estar ciente destes Termos de Uso.',
};

/** Entradas do rodapé — fonte única para links e rotas. */
export const PAGINAS_LEGAIS = [
  { rotulo: 'Termos de uso', caminho: '/termos-de-uso' },
  { rotulo: 'Política de privacidade', caminho: '/politica-de-privacidade' },
] as const;
