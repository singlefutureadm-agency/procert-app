import { matchPath } from 'react-router-dom';

/**
 * Texto de ajuda de cada tela do painel — a "sistemática de tutorial".
 *
 * Por que um registro central em vez de um texto solto dentro de cada página:
 *
 * 1. **A ajuda é sobre a tela, não sobre o componente.** `ProdutoFormPage`
 *    atende duas rotas (`/produtos/novo` e `/produtos/:id/editar`) e o que o
 *    iniciante precisa saber é diferente nas duas — criar abre a trilha,
 *    editar não a altera. Chaveando por ROTA, cada uma ganha o seu texto sem
 *    condicional espalhada pelo JSX da página.
 * 2. **Some a chance de esquecer.** O botão nasce dentro do `CabecalhoPagina`,
 *    por onde as 22 telas do painel já passam. Tela nova sem verbete é pega
 *    pelo teste `conteudo-ajuda.test.ts`, que percorre as rotas reais do
 *    `router.tsx` e cobra uma entrada para cada uma — sem isso a lacuna seria
 *    silenciosa: a tela simplesmente não mostraria o botão, e ninguém notaria.
 * 3. **O texto fica revisável num lugar só.** É conteúdo de produto, escrito
 *    para quem nunca viu um processo de certificação; misturado ao JSX ele
 *    nunca seria relido inteiro.
 *
 * O conteúdo aqui não descreve botões ("clique em Salvar") — descreve as
 * REGRAS que o sistema aplica e que não estão visíveis na tela. É isso que o
 * iniciante não tem como deduzir olhando, e é o que faz a ajuda valer a pena.
 */

export interface TopicoAjuda {
  titulo: string;
  texto: string;
}

export interface ProximoPasso {
  texto: string;
  para: string;
}

/**
 * Versão do verbete para quem entra como CLIENTE.
 *
 * Não é um adendo à explicação da equipe: é outra explicação. Sete telas são
 * compartilhadas entre os dois públicos, e nelas o cliente e o analista estão
 * fazendo coisas OPOSTAS — um responde a não conformidade, o outro a avalia;
 * um baixa o certificado, o outro o emite. Uma nota de rodapé dizendo "você vê
 * só os seus" não cobre isso: o corpo do texto continuaria ensinando a operar
 * botões que o cliente não tem.
 *
 * Campo ausente cai na versão da equipe, que é o texto neutro. `proximoPasso`
 * é a exceção deliberada — ver `resolverAjuda`.
 */
export interface AjudaCliente {
  titulo?: string;
  resumo?: string;
  topicos?: TopicoAjuda[];
  proximoPasso?: ProximoPasso;
}

export interface ConteudoAjuda {
  /** Padrão de rota do `router.tsx`, com os mesmos parâmetros. */
  rota: string;
  /** Título do modal. Nomeia a tela, não repete o `<h1>` quando ele é dinâmico. */
  titulo: string;
  /** O que a tela mostra, em uma frase. */
  resumo: string;
  topicos: TopicoAjuda[];
  /** Fio condutor do tutorial da equipe: para onde ir depois desta tela. */
  proximoPasso?: ProximoPasso;
  /**
   * Variante para o CLIENTE. Obrigatória em toda tela que o cliente alcança —
   * o teste cobra isso a partir das rotas sem `papeis` no `router.tsx`.
   */
  cliente?: AjudaCliente;
}

/**
 * Ordem de declaração = ordem de avaliação. Hoje nenhum par de padrões é
 * ambíguo (`matchPath` exige casamento completo, então `/produtos` não pega
 * `/produtos/novo`), mas a lista segue agrupada por assunto para ser lida como
 * um roteiro, e não como um dicionário.
 */
export const AJUDA_TELAS: ConteudoAjuda[] = [
  // ----------------------------------------------------------------- Início
  {
    rota: '/dashboard',
    titulo: 'Painel inicial',
    resumo:
      'É o panorama de tudo que está em andamento agora: quantos produtos estão em processo, o que avançou nos últimos dias e onde há coisa parada.',
    topicos: [
      {
        titulo: 'Os cartões do topo são o resumo geral',
        texto:
          'Cada cartão conta o sistema inteiro, não a página que você tem aberta em outra tela. Clicar em um deles leva à lista completa daquele assunto.',
      },
      {
        titulo: 'Os gráficos ignoram os filtros das outras telas',
        texto:
          'Eles são calculados no servidor sobre a base toda, de propósito. Um gráfico montado sobre a página visível de uma lista diria "3 reprovadas" havendo 40 — e pareceria certo. Cada gráfico repete esse aviso no rodapé.',
      },
      {
        titulo: 'Últimas movimentações é a linha do tempo da operação',
        texto:
          'Mostra quem mudou o quê e quando, em qualquer produto. É o caminho mais rápido para retomar um processo de onde alguém parou.',
      },
    ],
    proximoPasso: {
      texto: 'Ver os produtos em processo de certificação',
      para: '/certificacoes',
    },
    cliente: {
      titulo: 'Seu painel',
      resumo:
        'O resumo da situação dos produtos da sua empresa: quantos estão em processo, o que avançou nos últimos dias e o que está esperando alguma ação sua.',
      topicos: [
        {
          titulo: 'Tudo aqui é só da sua empresa',
          texto:
            'Os números contam apenas os seus produtos. O filtro é aplicado no servidor a partir do seu login — nenhuma outra empresa aparece, e a sua não aparece para ninguém.',
        },
        {
          titulo: 'Comece pelo que está esperando você',
          texto:
            'Uma não conformidade aberta é o único ponto em que o processo depende da sua resposta. Enquanto ela estiver assim, a etapa reprovada não volta a ser avaliada.',
        },
        {
          titulo: 'Últimas movimentações mostra o que a equipe fez',
          texto:
            'Cada linha é uma mudança no processo de um produto seu, com a data. É o jeito mais rápido de saber o que andou desde a última vez que você entrou.',
        },
      ],
      proximoPasso: {
        texto: 'Acompanhar o andamento dos seus produtos',
        para: '/certificacoes',
      },
    },
  },

  // --------------------------------------------------------- Certificações
  {
    rota: '/certificacoes',
    titulo: 'Certificações em andamento',
    resumo:
      'A lista dos produtos que estão percorrendo uma trilha de certificação, com o quanto cada um já avançou.',
    topicos: [
      {
        titulo: 'Cada produto percorre uma trilha de etapas',
        texto:
          'A trilha é definida pela categoria do produto (análise documental, ensaios, auditoria de fábrica, decisão). O progresso na lista conta quantas dessas etapas já foram aprovadas.',
      },
      {
        titulo: 'A trilha não é uma fila',
        texto:
          'As etapas não precisam ser avaliadas em ordem. Ensaios podem terminar antes da análise documental — o número da etapa indica a posição dela na trilha, não a vez dela.',
      },
      {
        titulo: 'Abrir um produto mostra o processo completo',
        texto:
          'Lá dentro ficam o estado de cada etapa, o histórico com autoria e data, os documentos anexados e as não conformidades abertas.',
      },
    ],
    proximoPasso: {
      texto: 'Ver as não conformidades abertas',
      para: '/nao-conformidades',
    },
    cliente: {
      titulo: 'Andamento dos seus produtos',
      resumo:
        'Onde cada produto da sua empresa está no processo de certificação, e quanto já foi aprovado.',
      topicos: [
        {
          titulo: 'A barra de progresso conta etapas aprovadas',
          texto:
            'Cada produto percorre uma sequência de etapas definida pela categoria dele — análise de documentos, ensaios em laboratório, auditoria da fábrica e a decisão final. O progresso mostra quantas já foram aprovadas.',
        },
        {
          titulo: 'Progresso parado nem sempre é problema',
          texto:
            'As etapas não são avaliadas em ordem, e algumas demoram por natureza — um ensaio de laboratório leva semanas. Só há algo esperando por você se houver uma não conformidade aberta.',
        },
        {
          titulo: 'Abra o produto para ver o detalhe',
          texto:
            'Lá dentro está o estado de cada etapa, o que a equipe registrou em cada uma, os documentos e o que eventualmente foi pedido a você.',
        },
        {
          titulo: 'Você vê apenas os seus produtos',
          texto:
            'A lista é filtrada no servidor pelo seu login. Não há como abrir o processo de outra empresa, mesmo digitando o endereço direto.',
        },
      ],
      proximoPasso: {
        texto: 'Entender a tela de um processo, etapa a etapa',
        para: '/produtos',
      },
    },
  },
  {
    rota: '/certificacoes/produto/:produtoId',
    titulo: 'O processo deste produto',
    resumo:
      'A trilha completa deste produto: em que estado está cada etapa, quem mexeu, quando, com quais evidências e quais pendências.',
    topicos: [
      {
        titulo: 'Os quatro estados de uma etapa',
        texto:
          'Pendente (ninguém começou), Em andamento (a avaliação começou), Aprovado e Reprovado. Uma etapa pode ir direto de Pendente para Aprovado quando não houve o que tratar.',
      },
      {
        titulo: 'Etapa que exige evidência não é aprovada sem anexo',
        texto:
          'Algumas etapas são marcadas na trilha como dependentes de documento — um laudo de ensaio, um relatório de auditoria. Sem o arquivo anexado, o sistema recusa a aprovação. A regra vive no servidor, não só na tela.',
      },
      {
        titulo: 'Reprovar é diferente de anotar um problema',
        texto:
          'Ao reprovar, abra uma não conformidade junto. Ela nasce no mesmo instante da reprovação e passa a ter código, gravidade e prazo — vira um item que alguém precisa responder, em vez de uma observação em texto livre que se perde.',
      },
      {
        titulo: 'O histórico não é apagável',
        texto:
          'Toda mudança de estado entra na linha do tempo com autor e data, e continua lá mesmo que a pessoa saia da equipe depois. É o que sustenta a rastreabilidade do processo.',
      },
      {
        titulo: 'Exportar gera a planilha do processo inteiro',
        texto:
          'A exportação traz uma aba de visão geral, uma aba por etapa e o histórico — em XLSX ou CSV, prontos para abrir no Excel.',
      },
    ],
    proximoPasso: {
      texto: 'Ver as não conformidades abertas',
      para: '/nao-conformidades',
    },
    cliente: {
      titulo: 'O processo deste produto',
      resumo:
        'A trilha completa deste produto: em que pé está cada etapa, o que a equipe registrou e o que foi anexado ao longo do caminho.',
      topicos: [
        {
          titulo: 'O que cada estado quer dizer',
          texto:
            'Pendente: a etapa ainda não começou. Em andamento: está sendo avaliada. Aprovado: cumprida. Reprovado: foi encontrado algo que precisa ser corrigido — e nesse caso há uma não conformidade explicando o quê.',
        },
        {
          titulo: 'A ordem das etapas não é a ordem dos acontecimentos',
          texto:
            'O número indica a posição da etapa na trilha, não a vez dela. É normal que a etapa 3 seja aprovada antes da 2 — cada uma depende de coisas diferentes.',
        },
        {
          titulo: 'Reprovado não significa processo perdido',
          texto:
            'A reprovação de uma etapa abre uma não conformidade com prazo para você responder. Respondida e aceita, a etapa volta a ser avaliada. O processo continua.',
        },
        {
          titulo: 'O histórico mostra tudo que foi feito, e por quem',
          texto:
            'Cada mudança fica registrada com data e autor, e não é apagável. É o seu comprovante de como o processo correu.',
        },
        {
          titulo: 'Exportar gera a planilha do processo',
          texto:
            'Útil para levar a uma reunião interna ou anexar a uma prestação de contas: sai em Excel ou CSV, com uma aba por etapa e o histórico completo.',
        },
      ],
      proximoPasso: {
        texto: 'Ver o que está esperando resposta sua',
        para: '/nao-conformidades',
      },
    },
  },
  {
    rota: '/nao-conformidades',
    titulo: 'Não conformidades',
    resumo:
      'Os problemas encontrados nas avaliações, cada um com código próprio, gravidade e prazo de resposta — e o acompanhamento até o desfecho.',
    topicos: [
      {
        titulo: 'O ciclo tem quatro estados',
        texto:
          'Aberta (a equipe registrou o problema) → Em tratativa (o cliente respondeu) → Resolvida ou Reprovada (a equipe avaliou a resposta).',
      },
      {
        titulo: 'Resolver não aprova a etapa',
        texto:
          'Uma não conformidade resolvida devolve a etapa para Em andamento, não para Aprovado. A etapa precisa ser reavaliada com a correção em mãos — é essa a diferença entre "o cliente respondeu" e "está conforme".',
      },
      {
        titulo: 'Menor e Maior não são só um rótulo',
        texto:
          'Maior compromete a conformidade do produto; Menor admite correção pontual. A gravidade orienta o prazo e o rigor da reavaliação.',
      },
      {
        titulo: 'Não se reabre uma NC encerrada',
        texto:
          'Se o problema voltar, registre uma nova. O histórico de cada ocorrência fica preservado separadamente, com o código do ano (NC-2026-000123).',
      },
    ],
    proximoPasso: {
      texto: 'Ver os certificados emitidos',
      para: '/certificados',
    },
    cliente: {
      titulo: 'O que precisa da sua resposta',
      resumo:
        'As pendências levantadas pela equipe técnica nos seus produtos. É a única tela do painel em que o processo depende de uma ação sua.',
      topicos: [
        {
          titulo: 'Aberta quer dizer que a bola está com você',
          texto:
            'A equipe encontrou algo em uma etapa e descreveu o que precisa ser corrigido ou comprovado. Enquanto você não responder, o processo daquele produto não avança.',
        },
        {
          titulo: 'O prazo de resposta está no próprio item',
          texto:
            'Cada não conformidade traz uma data limite. Ela existe para o processo não ficar aberto indefinidamente — se precisar de mais tempo, fale com a equipe antes do prazo, não depois.',
        },
        {
          titulo: 'Maior e Menor indicam o tamanho do problema',
          texto:
            'Maior compromete a conformidade do produto e costuma exigir um novo ensaio ou uma mudança de fornecedor. Menor admite correção pontual, como um documento faltando.',
        },
        {
          titulo: 'Responder não encerra sozinho',
          texto:
            'Sua resposta muda o item para Em tratativa e a equipe a avalia. Se for aceita, a etapa reprovada volta a ser avaliada — não é aprovada automaticamente. Se não for, o item é reprovado e você é informado do motivo.',
        },
        {
          titulo: 'Seja específico na resposta',
          texto:
            'Anexe o laudo, a nota do fornecedor ou a foto da correção. Resposta com evidência é avaliada de uma vez; sem ela, costuma voltar pedindo o comprovante.',
        },
      ],
      proximoPasso: {
        texto: 'Ver seus certificados emitidos',
        para: '/certificados',
      },
    },
  },

  // ---------------------------------------------------------- Certificados
  {
    rota: '/certificados',
    titulo: 'Certificados emitidos',
    resumo:
      'Os certificados de conformidade já emitidos, com número, validade, situação atual e o PDF para download.',
    topicos: [
      {
        titulo: 'Só emite com todas as etapas obrigatórias aprovadas',
        texto:
          'Etapas opcionais pendentes não bloqueiam a emissão; as obrigatórias, sim. A tela do processo mostra quantas obrigatórias já foram aprovadas, justamente para não ser preciso adivinhar.',
      },
      {
        titulo: 'Um produto tem no máximo um certificado vigente',
        texto:
          'Enquanto houver um Emitido ou Suspenso, o sistema recusa emitir outro para o mesmo produto.',
      },
      {
        titulo: 'Vencido não é uma decisão, é uma data',
        texto:
          'A situação Vencido é aplicada sozinha quando a validade passa. Suspender e Cancelar, sim, são decisões — e exigem motivo registrado. Cancelado é definitivo.',
      },
      {
        titulo: 'A validade vem da categoria do produto',
        texto:
          'Cada categoria define a validade em meses, salvo se uma data for informada na emissão. O número do certificado é sequencial por ano (PROCERT-2026-000045) e nunca muda.',
      },
    ],
    proximoPasso: {
      texto: 'Ver o que está perto de vencer',
      para: '/certificacoes/em-risco',
    },
    cliente: {
      titulo: 'Seus certificados',
      resumo:
        'Os certificados de conformidade emitidos para os produtos da sua empresa, com número, validade e o PDF para baixar.',
      topicos: [
        {
          titulo: 'O PDF é o documento oficial',
          texto:
            'Baixe por esta tela sempre que precisar apresentá-lo. O número do certificado é sequencial e nunca muda — é por ele que o documento é identificado.',
        },
        {
          titulo: 'Emitido, Suspenso, Cancelado, Vencido',
          texto:
            'Emitido é o certificado válido. Vencido acontece sozinho quando a data de validade passa. Suspenso e Cancelado são decisões do organismo certificador e vêm sempre com um motivo registrado — Cancelado é definitivo.',
        },
        {
          titulo: 'O certificado só sai com o processo completo',
          texto:
            'Todas as etapas obrigatórias da trilha precisam estar aprovadas. Se o seu produto ainda não tem certificado, a tela do processo mostra o que falta.',
        },
        {
          titulo: 'Acompanhe a validade',
          texto:
            'A renovação não é automática: ela exige um novo processo, que leva tempo. Comece com folga em relação à data de validade.',
        },
      ],
      proximoPasso: {
        texto: 'Ver o que está perto de vencer',
        para: '/certificacoes/em-risco',
      },
    },
  },
  {
    rota: '/certificacoes/em-risco',
    titulo: 'Vencimentos próximos',
    resumo:
      'Os certificados que vencem em breve — a lista para agir antes que o produto perca a conformidade no mercado.',
    topicos: [
      {
        titulo: 'É uma tela de antecedência, não de problema',
        texto:
          'Um certificado listado aqui ainda está válido. Ele aparece para que a recertificação comece com folga, e não depois do vencimento.',
      },
      {
        titulo: 'A recertificação começa por um processo novo',
        texto:
          'Renovar não é editar o certificado existente: o produto percorre a trilha de novo, e um certificado novo é emitido ao final, com número próprio.',
      },
    ],
    cliente: {
      titulo: 'Seus certificados perto de vencer',
      resumo:
        'Os certificados da sua empresa cuja validade está próxima do fim — a lista para providenciar a renovação a tempo.',
      topicos: [
        {
          titulo: 'Aparecer aqui não é problema, é aviso',
          texto:
            'O certificado listado continua válido. Ele aparece com antecedência justamente para dar tempo de renovar antes do vencimento.',
        },
        {
          titulo: 'Renovar é refazer o processo',
          texto:
            'A renovação não prorroga o certificado atual: o produto percorre a trilha de novo e recebe um certificado novo ao final. Por isso comece cedo — ensaios e auditorias têm prazo próprio.',
        },
        {
          titulo: 'Certificado vencido tira o produto de conformidade',
          texto:
            'Passada a validade, a situação muda para Vencido sozinha. Procure a equipe assim que um produto seu aparecer nesta lista.',
        },
      ],
    },
  },

  // --------------------------------------------------------------- Produtos
  {
    rota: '/produtos',
    titulo: 'Produtos',
    resumo:
      'O cadastro dos itens submetidos à certificação. É por aqui que um processo começa.',
    topicos: [
      {
        titulo: 'Cadastrar um produto já abre a certificação',
        texto:
          'Ao salvar, o sistema cria a trilha do produto com todas as etapas da categoria escolhida, todas em Pendente. Não existe passo separado de "iniciar processo".',
      },
      {
        titulo: 'Inativar não é excluir',
        texto:
          'Produtos inativos saem da lista principal mas mantêm processo, histórico e certificados. Use a visão de inativos para consultá-los.',
      },
    ],
    proximoPasso: {
      texto: 'Ver como as categorias definem a trilha',
      para: '/categorias',
    },
    cliente: {
      titulo: 'Seus produtos',
      resumo:
        'Os produtos da sua empresa cadastrados para certificação, com a categoria e a situação de cada um.',
      topicos: [
        {
          titulo: 'Quem cadastra é a equipe do organismo certificador',
          texto:
            'O cadastro do produto é feito pela equipe a partir da documentação que você envia. Se faltar um produto aqui, é com a equipe que se resolve.',
        },
        {
          titulo: 'A categoria determina o processo',
          texto:
            'É ela que define quais etapas o produto vai percorrer e por quanto tempo o certificado vale. Categorias diferentes têm exigências diferentes.',
        },
        {
          titulo: 'Cadastrado é sinônimo de processo aberto',
          texto:
            'Não existe um passo separado de "iniciar". Assim que o produto entra, a trilha de etapas dele já existe e pode ser acompanhada.',
        },
      ],
      proximoPasso: {
        texto: 'Ver o andamento de cada um',
        para: '/certificacoes',
      },
    },
  },
  {
    rota: '/produtos/novo',
    titulo: 'Cadastrar um produto',
    resumo:
      'O formulário que cria o produto e, junto com ele, todo o processo de certificação.',
    topicos: [
      {
        titulo: 'A categoria é a decisão mais importante',
        texto:
          'Ela define a trilha de etapas que o produto vai percorrer e a validade do futuro certificado. Depois de salvo, a trilha aberta não é trocada mudando a categoria.',
      },
      {
        titulo: 'Categoria sem trilha não aceita produto',
        texto:
          'Se a categoria que você precisa não aparece ou é recusada, é porque ela ainda não tem uma trilha publicada. Crie a trilha na tela de categorias primeiro.',
      },
      {
        titulo: 'O produto guarda a versão da trilha usada hoje',
        texto:
          'Se a categoria ganhar uma versão nova amanhã, este produto continua sendo avaliado pelas regras vigentes agora. É proposital: a régua não muda no meio do processo.',
      },
    ],
  },
  {
    rota: '/produtos/:id/editar',
    titulo: 'Editar produto',
    resumo:
      'Ajuste dos dados cadastrais do produto — nome, descrição, preço, foto.',
    topicos: [
      {
        titulo: 'A trilha já aberta não é alterada aqui',
        texto:
          'As etapas do processo, o que já foi aprovado e o histórico permanecem como estão. Esta tela mexe só na ficha do produto.',
      },
      {
        titulo: 'Para mudar a trilha, migre a versão',
        texto:
          'Quando a categoria tem uma versão de trilha mais nova, a tela do processo oferece a migração. Ela acrescenta as etapas que faltam e renumera a trilha, sem apagar o que já foi avaliado — e nunca acontece sozinha.',
      },
    ],
  },

  // --------------------------------------------------------------- Clientes
  {
    rota: '/clientes',
    titulo: 'Clientes',
    resumo:
      'As empresas atendidas pelo organismo certificador, com o responsável de cada uma e a data do último acesso.',
    topicos: [
      {
        titulo: 'Cada cliente é também um login',
        texto:
          'O cadastro do cliente é a conta de acesso da empresa ao painel. Ele enxerga apenas os próprios produtos, processos, não conformidades e certificados.',
      },
      {
        titulo: 'Último acesso responde "quem sumiu"',
        texto:
          'É a data do último login bem-sucedido da conta. Serve para encontrar cliente inativo — não mede frequência nem tempo de uso.',
      },
      {
        titulo: 'Responsável é informativo',
        texto:
          'O responsável indica o ponto de contato da carteira. Ele não restringe acesso: qualquer pessoa da equipe continua enxergando todos os clientes.',
      },
    ],
    proximoPasso: {
      texto: 'Ver os comparativos por cliente',
      para: '/relatorios/clientes',
    },
  },
  {
    rota: '/clientes/novo',
    titulo: 'Cadastrar cliente',
    resumo:
      'Criação da empresa e, ao mesmo tempo, da conta com que ela vai acessar o painel.',
    topicos: [
      {
        titulo: 'A senha é obrigatória aqui',
        texto:
          'Sem ela a empresa não consegue entrar. Na edição, o campo passa a ser opcional — deixar em branco mantém a senha atual.',
      },
      {
        titulo: 'O e-mail não pode repetir em lugar nenhum',
        texto:
          'Ele é único entre clientes e equipe interna. Um mesmo endereço não pode ser cliente e funcionário ao mesmo tempo.',
      },
      {
        titulo: 'O CEP preenche o endereço sozinho',
        texto:
          'Ao completar os oito dígitos, logradouro, bairro, cidade e UF são buscados automaticamente. Campos que você já preencheu à mão não são sobrescritos.',
      },
    ],
  },
  {
    rota: '/clientes/:id/editar',
    titulo: 'Editar cliente',
    resumo: 'Atualização do cadastro e da conta de acesso da empresa.',
    topicos: [
      {
        titulo: 'Senha em branco mantém a atual',
        texto:
          'Preencha o campo apenas se quiser trocar a senha da empresa. Deixá-lo vazio não apaga nem redefine nada.',
      },
      {
        titulo: 'Inativar bloqueia o acesso na hora',
        texto:
          'A conta é revalidada a cada requisição: um cliente inativado perde o acesso imediatamente, mesmo que esteja com o painel aberto.',
      },
    ],
  },

  // ------------------------------------------------------------- Categorias
  {
    rota: '/categorias',
    titulo: 'Categorias de produto',
    resumo:
      'As famílias de produto (EPIs, brinquedos, artigos escolares…). Cada uma define a própria trilha de certificação e a validade do certificado.',
    topicos: [
      {
        titulo: 'É a categoria que define o processo',
        texto:
          'A trilha de etapas que um produto vai percorrer vem da categoria escolhida no cadastro dele. Categoria diferente, processo diferente.',
      },
      {
        titulo: 'A validade em meses vale para o certificado',
        texto:
          'Ao emitir um certificado, a validade é calculada a partir dessa quantidade de meses, salvo se uma data for informada.',
      },
      {
        titulo: 'Categoria nova precisa de trilha antes de receber produto',
        texto:
          'Criar a categoria não basta: enquanto ela não tiver uma trilha com etapas, nenhum produto pode ser cadastrado nela.',
      },
    ],
    /*
     * Sem `proximoPasso` de propósito. O passo seguinte natural é a trilha de
     * uma categoria, mas essa URL exige um id — e apontar para um id fixo
     * mandaria o iniciante para um 404 assim que aquela categoria fosse
     * removida. A própria lista desta tela é o caminho, e é ela que sabe quais
     * ids existem.
     */
  },
  {
    rota: '/categorias/:id',
    titulo: 'Trilha da categoria',
    resumo:
      'As etapas que os produtos desta categoria percorrem, organizadas em versões.',
    topicos: [
      {
        titulo: 'Trilha em uso não se edita — versiona-se',
        texto:
          'Assim que um produto é vinculado a uma versão, ela fica imutável. Isso protege quem já está no meio do processo de ter a régua trocada. Só versão sem nenhum produto ainda pode ser alterada.',
      },
      {
        titulo: 'Criar uma versão nova não mexe nos produtos existentes',
        texto:
          'Eles continuam na versão em que entraram. A versão nova passa a valer para os próximos cadastros, e a anterior é encerrada — a categoria nunca tem duas vigentes.',
      },
      {
        titulo: 'Obrigatória e Exige documento mudam o comportamento',
        texto:
          'Só as etapas obrigatórias travam a emissão do certificado. As marcadas como "exige documento" não podem ser aprovadas sem evidência anexada.',
      },
      {
        titulo: 'A ordem pode ser arrastada',
        texto:
          'Ela define a sequência mostrada na trilha do produto. Pela alça de cada linha a reordenação também funciona pelo teclado.',
      },
    ],
  },

  // ----------------------------------------------------------------- Equipe
  {
    rota: '/equipe',
    titulo: 'Equipe interna',
    resumo:
      'As pessoas do organismo certificador que acessam o painel, e o papel de cada uma.',
    topicos: [
      {
        titulo: 'Dois papéis, alcances diferentes',
        texto:
          'Funcionário opera os processos: produtos, certificações, não conformidades, certificados. Administrador faz isso e mais a gestão de equipe, a aparência do painel e o relatório de desempenho.',
      },
      {
        titulo: 'Sempre precisa sobrar um administrador ativo',
        texto:
          'Rebaixar, desativar ou excluir o último administrador é recusado. Também não é possível desativar ou excluir o próprio cadastro.',
      },
      {
        titulo: 'A autoria sobrevive à saída da pessoa',
        texto:
          'Excluir um cadastro não apaga o nome de quem aprovou uma etapa, abriu uma NC ou emitiu um certificado. O registro histórico continua íntegro.',
      },
    ],
  },
  {
    rota: '/equipe/novo',
    titulo: 'Cadastrar pessoa na equipe',
    resumo: 'Criação de um acesso interno, com papel de funcionário ou administrador.',
    topicos: [
      {
        titulo: 'O papel decide o que a pessoa alcança',
        texto:
          'Comece por Funcionário e promova depois se for preciso. Administrador dá acesso à gestão da equipe, à aparência e ao desempenho por pessoa.',
      },
      {
        titulo: 'A senha é obrigatória aqui',
        texto: 'Na edição ela passa a ser opcional: em branco, mantém a atual.',
      },
    ],
  },
  {
    rota: '/equipe/:id/editar',
    titulo: 'Editar pessoa da equipe',
    resumo: 'Atualização do cadastro, do papel e do acesso de alguém da equipe.',
    topicos: [
      {
        titulo: 'Senha em branco mantém a atual',
        texto: 'Preencha apenas para trocar a senha da pessoa.',
      },
      {
        titulo: 'Algumas mudanças são recusadas de propósito',
        texto:
          'Você não pode desativar o próprio cadastro, nem rebaixar ou desativar o último administrador ativo do sistema.',
      },
    ],
  },

  // ------------------------------------------------------------- Relatórios
  {
    rota: '/relatorios/produtos',
    titulo: 'Comparativo de produtos',
    resumo:
      'Como os produtos se comparam entre si: quanto avançaram, onde emperram e quantas não conformidades acumularam.',
    topicos: [
      {
        titulo: 'Serve para achar o que está travado',
        texto:
          'Produtos parados há muito tempo na mesma etapa aparecem lado a lado com os que fluíram, o que torna o gargalo visível sem abrir processo por processo.',
      },
      {
        titulo: 'Os números vêm da base inteira',
        texto:
          'O relatório é calculado no servidor sobre todos os registros, não sobre a página exibida.',
      },
    ],
    proximoPasso: {
      texto: 'Ver quanto tempo o processo leva',
      para: '/relatorios/tempo-ciclo',
    },
  },
  {
    rota: '/relatorios/tempo-ciclo',
    titulo: 'Tempo de ciclo',
    resumo:
      'Quanto tempo o processo leva — em três medidas diferentes, porque "o tempo da etapa" não é uma pergunta só.',
    topicos: [
      {
        titulo: 'Lead time da trilha',
        texto:
          'Do cadastro do produto até a aprovação da última etapa obrigatória. É o tempo que o cliente sente.',
      },
      {
        titulo: 'Tempo de tratamento da etapa',
        texto:
          'De quando a avaliação da etapa começou até a aprovação dela. É o tempo de trabalho da equipe.',
      },
      {
        titulo: 'Tempo em fila',
        texto:
          'De quando a etapa foi criada até alguém começar a tratá-la. É espera pura — e costuma ser o maior dos três.',
      },
      {
        titulo: 'É mediana, não média',
        texto:
          'Um processo excepcionalmente longo distorce a média e faz o número parecer pior do que a rotina. A mediana descreve o caso típico.',
      },
      {
        titulo: 'Vazio aparece como "—", nunca como zero',
        texto:
          'Sem base para calcular, o relatório não mostra 0: zero afirmaria que algo levou zero dia. Etapas ainda abertas ficam em bloco separado, para não puxar a mediana para baixo.',
      },
    ],
  },
  {
    rota: '/relatorios/clientes',
    titulo: 'Comparativo de clientes',
    resumo:
      'O volume e o desfecho dos processos por empresa: quantos produtos, quantos certificados, quantas não conformidades.',
    topicos: [
      {
        titulo: 'Mostra concentração e recorrência',
        texto:
          'Ajuda a ver de quem vem o volume e quem repete o mesmo tipo de problema de um processo para o outro.',
      },
      {
        titulo: 'Último acesso ajuda a ler o resto',
        texto:
          'Um cliente com processo parado e sem acesso há meses é um caso de retomada comercial, não de gargalo técnico.',
      },
    ],
  },
  {
    rota: '/relatorios/equipe',
    titulo: 'Desempenho da equipe',
    resumo:
      'O que cada pessoa da equipe registrou no período: etapas avaliadas, não conformidades abertas, certificados emitidos.',
    topicos: [
      {
        titulo: 'É medido por autoria do registro',
        texto:
          'Conta quem apertou o botão em cada mudança de estado. Não mede esforço, dificuldade do caso nem tempo dedicado.',
      },
      {
        titulo: 'Leia junto com o tempo de ciclo',
        texto:
          'Volume alto com fila alta costuma ser gargalo de capacidade; volume baixo com fila baixa costuma ser só menos demanda no período.',
      },
      {
        titulo: 'Visível apenas para administradores',
        texto:
          'É informação de gestão sobre colegas, e por isso tem alcance mais restrito que os comparativos operacionais.',
      },
    ],
  },

  // --------------------------------------------------------------- Aparência
  {
    rota: '/dashboard/aparencia',
    titulo: 'Aparência do painel',
    resumo:
      'As cores, os cantos e as logos do painel — o que você salvar aqui vale para todo mundo que usa o sistema.',
    topicos: [
      {
        titulo: 'A prévia mostra os dois temas lado a lado',
        texto:
          'Claro e escuro são renderizados com o tema que você está editando, antes de salvar. Vale conferir os dois: uma cor que funciona num costuma sumir no outro.',
      },
      {
        titulo: 'O aviso de contraste não bloqueia',
        texto:
          'Combinações com contraste insuficiente são sinalizadas, mas o salvamento é permitido. O alerta existe para que a escolha seja consciente — texto de baixo contraste fica ilegível para parte dos usuários.',
      },
      {
        titulo: 'São duas logos, uma por tema',
        texto:
          'Enviando apenas uma, ela é usada nos dois modos. Enviando as duas, cada tema usa a sua.',
      },
      {
        titulo: 'Salvar avisa se alguém editou antes de você',
        texto:
          'Se outro administrador tiver salvado enquanto você editava, o sistema recusa a gravação em vez de sobrescrever o trabalho dele em silêncio.',
      },
    ],
  },
];

/** O verbete já escolhido para o papel de quem está lendo. */
export interface AjudaResolvida {
  titulo: string;
  resumo: string;
  topicos: TopicoAjuda[];
  proximoPasso?: ProximoPasso;
}

/**
 * Escolhe entre a versão da equipe e a do cliente.
 *
 * `proximoPasso` NÃO tem fallback para a versão da equipe, e essa assimetria é
 * deliberada: os roteiros levam a telas diferentes, e o da equipe passa por
 * categorias, relatórios e cadastro — telas que o `RotaProtegida` fecha para o
 * cliente. Herdá-lo mandaria o cliente para "sem permissão" no exato momento em
 * que ele resolveu seguir a orientação do tutorial. Sem variante própria, o
 * cliente simplesmente não vê o botão de próximo passo.
 */
export function resolverAjuda(
  ajuda: ConteudoAjuda,
  ehCliente: boolean,
): AjudaResolvida {
  const variante = ehCliente ? ajuda.cliente : undefined;

  return {
    titulo: variante?.titulo ?? ajuda.titulo,
    resumo: variante?.resumo ?? ajuda.resumo,
    topicos: variante?.topicos ?? ajuda.topicos,
    proximoPasso: ehCliente ? variante?.proximoPasso : ajuda.proximoPasso,
  };
}

/**
 * Ajuda correspondente a uma URL do painel, ou `undefined` se a tela não tiver
 * verbete.
 *
 * `matchPath` casa o caminho INTEIRO, então `/produtos` não captura
 * `/produtos/novo` e a ordem da lista não vira armadilha silenciosa.
 */
export function ajudaDaRota(caminho: string): ConteudoAjuda | undefined {
  return AJUDA_TELAS.find((ajuda) => matchPath(ajuda.rota, caminho) !== null);
}
