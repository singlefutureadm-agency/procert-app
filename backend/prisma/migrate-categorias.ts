/**
 * Transposição do catálogo global de etapas para trilhas por categoria.
 *
 * Contexto: até esta versão, `EtapaCertificacao` era um catálogo único e toda
 * etapa ativa valia para todo produto. Agora a trilha pertence a uma
 * `CategoriaProduto` e é versionada em `ModeloTrilha` → `ModeloEtapa`.
 *
 * Uso:
 *   Simulação (não grava nada):  npm run migrate:categorias -- --dry-run
 *   Execução:                    npm run migrate:categorias
 *
 * Ordem das operações:
 *   1. cria a categoria "Geral", que recebe todos os produtos existentes
 *   2. cria a versão 1 da trilha dessa categoria
 *   3. copia cada etapa do catálogo antigo para uma `ModeloEtapa` da versão 1
 *   4. aponta os produtos existentes para a categoria/modelo "Geral"
 *   5. remapeia `certificacoes_produto.etapa_id` para as novas `ModeloEtapa`
 *
 * Pré-requisito: a migration `categorias_e_modelos_trilha` já aplicada — ela
 * derruba a FK antiga de `certificacoes_produto`, sem o que o passo 5 falha.
 * Depois deste script, rode `npx prisma migrate dev` para fechar a transição
 * (NOT NULL nas colunas de produtos e FK nova em certificacoes_produto).
 *
 * O script é idempotente: rodar duas vezes não duplica categoria, modelo nem
 * etapas, e produtos/certificações já migrados são ignorados.
 */
import { PrismaClient, TipoEtapa } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const CATEGORIA_PADRAO = 'Geral';
const DESCRICAO_CATEGORIA =
  'Categoria criada na migração do catálogo global de etapas. ' +
  'Agrupa os produtos cadastrados antes das trilhas por categoria.';

/**
 * Classificação das etapas herdadas. O catálogo antigo não tinha o conceito de
 * tipo; estes são os nomes semeados pelo `seed.ts`. Qualquer outro nome cai em
 * OUTRO e pode ser ajustado depois pela tela de categorias.
 */
const TIPO_POR_NOME: Record<string, TipoEtapa> = {
  'Análise documental': TipoEtapa.DOCUMENTAL,
  'Ensaios laboratoriais': TipoEtapa.ENSAIO,
  'Auditoria de fábrica': TipoEtapa.AUDITORIA_FABRICA,
  'Emissão do certificado': TipoEtapa.DECISAO,
};

function log(mensagem: string): void {
  console.log(`${DRY_RUN ? '[simulação] ' : ''}${mensagem}`);
}

async function main(): Promise<void> {
  console.log(
    DRY_RUN
      ? '🔍 Simulação: nenhuma alteração será gravada.\n'
      : '🚚 Migrando catálogo global de etapas para trilhas por categoria.\n',
  );

  // --- 1. Categoria que recebe o acervo existente ---------------------------
  let categoria = await prisma.categoriaProduto.findUnique({
    where: { nome: CATEGORIA_PADRAO },
  });

  if (categoria) {
    log(`Categoria "${CATEGORIA_PADRAO}" já existe (id ${categoria.id}).`);
  } else if (DRY_RUN) {
    log(`Criaria a categoria "${CATEGORIA_PADRAO}".`);
  } else {
    categoria = await prisma.categoriaProduto.create({
      data: { nome: CATEGORIA_PADRAO, descricao: DESCRICAO_CATEGORIA },
    });
    log(`Categoria "${CATEGORIA_PADRAO}" criada (id ${categoria.id}).`);
  }

  // --- 2. Versão 1 da trilha ------------------------------------------------
  let modelo = categoria
    ? await prisma.modeloTrilha.findUnique({
        where: { categoriaId_versao: { categoriaId: categoria.id, versao: 1 } },
        include: { etapas: true },
      })
    : null;

  /**
   * Se o modelo já tem etapas, esta migração já rodou antes.
   *
   * Essa checagem precisa ser feita no nível da execução, e não linha a linha:
   * ids de `etapas_certificacao` e de `modelos_etapa` são sequências
   * independentes e costumam se sobrepor (1..4 → 1..4 numa base recém-semeada),
   * então "o etapa_id existe em modelos_etapa?" não distingue migrado de
   * não migrado.
   */
  const migracaoJaAplicada = Boolean(modelo && modelo.etapas.length > 0);

  if (modelo) {
    log(`Modelo de trilha v1 já existe (id ${modelo.id}).`);
  } else if (DRY_RUN || !categoria) {
    log('Criaria o modelo de trilha v1 para a categoria.');
  } else {
    modelo = await prisma.modeloTrilha.create({
      data: { categoriaId: categoria.id, versao: 1, ativo: true },
      include: { etapas: true },
    });
    log(`Modelo de trilha v1 criado (id ${modelo.id}).`);
  }

  // --- 3. Catálogo antigo → etapas do modelo -------------------------------
  // Etapas inativas também entram quando alguma certificação as referencia:
  // sem isso as linhas ficariam órfãs e a FK da próxima migration falharia.
  const [catalogo, etapasEmUso] = await Promise.all([
    prisma.etapaCertificacao.findMany({ orderBy: { ordem: 'asc' } }),
    prisma.certificacaoProduto.findMany({
      distinct: ['etapaId'],
      select: { etapaId: true },
    }),
  ]);

  const idsEmUso = new Set(etapasEmUso.map((e) => e.etapaId));
  const aMigrar = catalogo.filter((etapa) => etapa.ativo || idsEmUso.has(etapa.id));
  const inativasEmUso = aMigrar.filter((etapa) => !etapa.ativo);

  if (inativasEmUso.length) {
    log(
      `Atenção: ${inativasEmUso.length} etapa(s) inativa(s) ainda em uso serão ` +
        `copiadas como não obrigatórias: ${inativasEmUso.map((e) => e.nome).join(', ')}.`,
    );
  }

  /**
   * Mapa: id da etapa antiga → id da ModeloEtapa nova.
   * Em simulação nada é criado, então o destino é PENDENTE — o suficiente para
   * conferir que toda certificação tem correspondente, sem inventar ids.
   */
  const PENDENTE = -1;
  const mapaEtapas = new Map<number, number>();

  for (const [indice, etapa] of aMigrar.entries()) {
    const existente = modelo?.etapas.find((m) => m.nome === etapa.nome);

    if (existente) {
      mapaEtapas.set(etapa.id, existente.id);
      log(`Etapa "${etapa.nome}" já migrada (modelo_etapa ${existente.id}).`);
      continue;
    }

    if (DRY_RUN || !modelo) {
      mapaEtapas.set(etapa.id, PENDENTE);
      log(`Criaria a etapa "${etapa.nome}" (ordem ${indice + 1}).`);
      continue;
    }

    const criada = await prisma.modeloEtapa.create({
      data: {
        modeloTrilhaId: modelo.id,
        nome: etapa.nome,
        descricao: etapa.descricao,
        ordem: indice + 1,
        tipo: TIPO_POR_NOME[etapa.nome] ?? TipoEtapa.OUTRO,
        obrigatoria: etapa.ativo,
      },
    });

    mapaEtapas.set(etapa.id, criada.id);
    log(`Etapa "${etapa.nome}" migrada (modelo_etapa ${criada.id}).`);
  }

  // --- 4. Produtos existentes → categoria/modelo "Geral" -------------------
  // As colunas ainda são nulas nesta fase; por isso o filtro por null.
  const produtosSemCategoria = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM produtos WHERE categoria_id IS NULL OR modelo_trilha_id IS NULL
  `;

  if (produtosSemCategoria.length === 0) {
    log('Nenhum produto pendente de categoria.');
  } else if (DRY_RUN || !modelo || !categoria) {
    log(`Apontaria ${produtosSemCategoria.length} produto(s) para "${CATEGORIA_PADRAO}".`);
  } else {
    await prisma.$executeRaw`
      UPDATE produtos
         SET categoria_id = ${categoria.id}, modelo_trilha_id = ${modelo.id}
       WHERE categoria_id IS NULL OR modelo_trilha_id IS NULL
    `;
    log(
      `${produtosSemCategoria.length} produto(s) apontado(s) para "${CATEGORIA_PADRAO}".`,
    );
  }

  // --- 5. Remapeia as certificações para as novas etapas -------------------
  const certificacoes = await prisma.certificacaoProduto.findMany({
    select: { id: true, etapaId: true },
  });

  let remapeadas = 0;
  const semCorrespondente: number[] = [];

  if (migracaoJaAplicada) {
    log(
      `Remapeamento já aplicado anteriormente — ${certificacoes.length} certificação(ões) mantidas.`,
    );
  }

  for (const certificacao of migracaoJaAplicada ? [] : certificacoes) {
    const novoId = mapaEtapas.get(certificacao.etapaId);

    if (novoId === undefined) {
      semCorrespondente.push(certificacao.id);
      continue;
    }

    if (!DRY_RUN && novoId !== PENDENTE) {
      await prisma.certificacaoProduto.update({
        where: { id: certificacao.id },
        data: { etapaId: novoId },
      });
    }
    remapeadas += 1;
  }

  if (!migracaoJaAplicada) {
    log(
      DRY_RUN
        ? `${remapeadas} certificação(ões) seriam remapeadas.`
        : `${remapeadas} certificação(ões) remapeada(s).`,
    );
  }

  if (semCorrespondente.length) {
    // Deixar passar quebraria a FK da próxima migration — melhor falhar aqui.
    throw new Error(
      `Certificações sem etapa correspondente no novo modelo: ${semCorrespondente.join(', ')}. ` +
        'Verifique se o catálogo antigo ainda contém as etapas referenciadas.',
    );
  }

  console.log(
    DRY_RUN
      ? '\n✅ Simulação concluída. Rode sem --dry-run para aplicar.'
      : '\n✅ Migração concluída. Rode `npx prisma migrate dev` para fechar a transição.',
  );
}

main()
  .catch((erro) => {
    console.error('\n❌ Falha na migração:', erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
