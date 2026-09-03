/**
 * Conferência da migração `20260902120000_trilhas_como_catalogo`.
 *
 * Contexto: a migration repontou dados existentes — cada categoria que tinha
 * trilha virou uma entrada do catálogo, as versões foram repontadas e a
 * categoria passou a apontar de volta. Isso é `UPDATE ... FROM` sobre linhas
 * reais, e o CI **não** consegue cobrir: o e2e sobe um PostgreSQL vazio, onde
 * `migrate deploy` prova que o SQL roda, não que ele acerta linhas — porque não
 * há linha. O próprio commit da migration pede a conferência em produção.
 *
 * Este script é essa conferência, escrita uma vez em vez de digitada a cada
 * banco. O que ele procura tem um sintoma em comum e é por isso que existe:
 * **nada aqui gera erro em tempo de execução**. Uma categoria sem trilha não
 * quebra nada — ela simplesmente recusa todo produto novo, com uma mensagem
 * que parece regra de negócio, e o defeito só aparece quando alguém tenta
 * cadastrar.
 *
 * Uso:
 *   npm run conferir:trilhas
 *
 * Contra outro banco (produção, por exemplo), sem tocar no `.env`:
 *   DATABASE_URL="postgresql://..." npm run conferir:trilhas
 *
 * É somente leitura: nenhuma escrita, nenhuma transação. Pode rodar em
 * produção a qualquer hora.
 *
 * Sai com código 1 se encontrar problema, para servir de porta em automação.
 */
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Achado {
  titulo: string;
  detalhe: string[];
  grave: boolean;
}

async function main(): Promise<void> {
  const achados: Achado[] = [];

  console.log('Conferindo a migração de trilhas...\n');

  const [trilhas, versoes, categorias, produtos] = await Promise.all([
    prisma.trilha.count(),
    prisma.modeloTrilha.count(),
    prisma.categoriaProduto.count(),
    prisma.produto.count(),
  ]);

  console.log(
    `  ${trilhas} trilha(s), ${versoes} versão(ões), ` +
      `${categorias} categoria(s), ${produtos} produto(s).\n`,
  );

  /**
   * Categoria sem trilha.
   *
   * O caso central. `CategoriaProduto.trilhaId` é anulável — a coluna permite
   * o estado, o domínio não. Uma categoria assim recusa cadastro de produto
   * com "categoria sem trilha", que é indistinguível de uma categoria recém
   * criada e ainda não configurada. Se ela TINHA trilha antes da migração, a
   * mensagem mente sobre a causa.
   *
   * A contagem de produtos é o que separa "categoria nova, ainda vazia" de
   * "categoria em uso que perdeu o vínculo".
   */
  const semTrilha = await prisma.categoriaProduto.findMany({
    where: { trilhaId: null },
    select: {
      id: true,
      nome: true,
      status: true,
      _count: { select: { produtos: true } },
    },
    orderBy: { id: 'asc' },
  });

  const emUso = semTrilha.filter((c) => c._count.produtos > 0);

  if (semTrilha.length > 0) {
    achados.push({
      titulo: `${semTrilha.length} categoria(s) sem trilha vinculada`,
      detalhe: semTrilha.map(
        (c) =>
          `#${c.id} ${c.nome} — ${c.status}, ${c._count.produtos} produto(s)` +
          (c._count.produtos > 0 ? '  ← já teve uso' : '  (nunca usada)'),
      ),
      // Categoria sem produto pode ser cadastro novo, legítimo e incompleto.
      // Com produto, alguém já a usou: perder o vínculo é regressão.
      grave: emUso.length > 0,
    });
  }

  /**
   * Trilha vinculada, mas sem versão vigente.
   *
   * O outro jeito de a categoria ficar muda, e o #36 o trata com mensagem
   * própria de propósito — as duas situações mandam o admin para telas
   * diferentes. Uma trilha cujas versões foram todas encerradas (`ativo:
   * false`) não serve para abrir produto.
   */
  const semVersaoVigente = await prisma.categoriaProduto.findMany({
    where: {
      trilhaId: { not: null },
      trilha: { versoes: { none: { ativo: true } } },
    },
    select: {
      id: true,
      nome: true,
      trilha: { select: { nome: true, _count: { select: { versoes: true } } } },
      _count: { select: { produtos: true } },
    },
    orderBy: { id: 'asc' },
  });

  if (semVersaoVigente.length > 0) {
    achados.push({
      titulo: `${semVersaoVigente.length} categoria(s) com trilha sem versão vigente`,
      detalhe: semVersaoVigente.map(
        (c) =>
          `#${c.id} ${c.nome} → trilha "${c.trilha?.nome}" ` +
          `(${c.trilha?._count.versoes ?? 0} versão(ões), nenhuma ativa), ` +
          `${c._count.produtos} produto(s)`,
      ),
      grave: true,
    });
  }

  /**
   * Trilha órfã — existe no catálogo e nenhuma categoria a segue.
   *
   * Não é defeito: o #36 tornou a trilha um cadastro próprio, e uma trilha
   * pode existir antes de ser vinculada. Aparece como aviso porque, logo
   * depois da migração, uma trilha órfã é sinal de que a categoria de origem
   * dela não recebeu o vínculo de volta.
   */
  const orfas = await prisma.trilha.findMany({
    where: { categorias: { none: {} } },
    select: { id: true, nome: true, _count: { select: { versoes: true } } },
    orderBy: { id: 'asc' },
  });

  if (orfas.length > 0) {
    achados.push({
      titulo: `${orfas.length} trilha(s) sem categoria que a siga`,
      detalhe: orfas.map(
        (t) => `#${t.id} ${t.nome} — ${t._count.versoes} versão(ões)`,
      ),
      grave: false,
    });
  }

  /**
   * Produto apontando para versão que sumiu.
   *
   * `Produto.modeloTrilhaId` é NOT NULL e a FK é `Restrict`, então o banco já
   * impede o estado. A consulta existe para provar que a migration não mexeu
   * no retrato de versão de cada produto — era a garantia declarada, e é a que
   * mais custaria caro se tivesse falhado, porque reconstruir qual versão
   * regia uma avaliação em andamento não é possível depois.
   */
  const produtosPorVersao = await prisma.produto.groupBy({
    by: ['modeloTrilhaId'],
    _count: true,
  });

  const versoesReferenciadas = await prisma.modeloTrilha.findMany({
    where: { id: { in: produtosPorVersao.map((p) => p.modeloTrilhaId) } },
    select: { id: true },
  });

  const idsExistentes = new Set(versoesReferenciadas.map((v) => v.id));
  const quebrados = produtosPorVersao.filter(
    (p) => !idsExistentes.has(p.modeloTrilhaId),
  );

  if (quebrados.length > 0) {
    achados.push({
      titulo: `${quebrados.length} versão(ões) de trilha referenciada por produto não existe(m)`,
      detalhe: quebrados.map(
        (p) => `modelo_trilha_id ${p.modeloTrilhaId} — ${p._count} produto(s)`,
      ),
      grave: true,
    });
  } else {
    console.log(
      `  Retrato de versão intacto: ${produtosPorVersao.length} versão(ões) ` +
        'distinta(s) em uso, todas existentes.\n',
    );
  }

  // ------------------------------------------------------------------ saída

  if (achados.length === 0) {
    console.log('OK — nenhum problema encontrado.');
    return;
  }

  const graves = achados.filter((a) => a.grave);

  for (const achado of achados) {
    console.log(`${achado.grave ? 'PROBLEMA' : 'AVISO'}: ${achado.titulo}`);
    for (const linha of achado.detalhe) console.log(`    ${linha}`);
    console.log('');
  }

  if (graves.length === 0) {
    console.log('Nenhum problema grave — os avisos acima podem ser legítimos.');
    return;
  }

  console.log(
    'Conserto: vincule a trilha pelo painel, em /trilhas, ou na tela da\n' +
      'categoria. Nenhum dos casos acima exige SQL à mão.',
  );
  process.exitCode = 1;
}

main()
  .catch((erro) => {
    console.error('Falha ao conferir:', erro);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
