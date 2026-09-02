/**
 * Seed inicial da base PostgreSQL.
 *
 * Popula:
 *  • as 27 unidades federativas (legado: tbl_estado)
 *  • a categoria "Geral" e a versão 1 da sua trilha de certificação
 *  • um administrador inicial para o primeiro acesso
 *
 * É idempotente: pode ser executado quantas vezes forem necessárias.
 *   npm run seed
 */
// Precisa vir antes de qualquer outro import: o `prisma migrate` carrega o
// `.env` sozinho, mas `ts-node` não — sem isto o script morre com
// "Environment variable not found: DATABASE_URL".
import 'dotenv/config';

import { PrismaClient, Role, TipoEtapa, TipoPessoa } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ESTADOS: Array<{ sigla: string; nome: string }> = [
  { sigla: 'AC', nome: 'Acre' },
  { sigla: 'AL', nome: 'Alagoas' },
  { sigla: 'AP', nome: 'Amapá' },
  { sigla: 'AM', nome: 'Amazonas' },
  { sigla: 'BA', nome: 'Bahia' },
  { sigla: 'CE', nome: 'Ceará' },
  { sigla: 'DF', nome: 'Distrito Federal' },
  { sigla: 'ES', nome: 'Espírito Santo' },
  { sigla: 'GO', nome: 'Goiás' },
  { sigla: 'MA', nome: 'Maranhão' },
  { sigla: 'MT', nome: 'Mato Grosso' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { sigla: 'MG', nome: 'Minas Gerais' },
  { sigla: 'PA', nome: 'Pará' },
  { sigla: 'PB', nome: 'Paraíba' },
  { sigla: 'PR', nome: 'Paraná' },
  { sigla: 'PE', nome: 'Pernambuco' },
  { sigla: 'PI', nome: 'Piauí' },
  { sigla: 'RJ', nome: 'Rio de Janeiro' },
  { sigla: 'RN', nome: 'Rio Grande do Norte' },
  { sigla: 'RS', nome: 'Rio Grande do Sul' },
  { sigla: 'RO', nome: 'Rondônia' },
  { sigla: 'RR', nome: 'Roraima' },
  { sigla: 'SC', nome: 'Santa Catarina' },
  { sigla: 'SP', nome: 'São Paulo' },
  { sigla: 'SE', nome: 'Sergipe' },
  { sigla: 'TO', nome: 'Tocantins' },
];

const CATEGORIA_PADRAO = {
  nome: 'Geral',
  descricao:
    'Categoria padrão para produtos sem uma família específica definida. ' +
    'Crie categorias próprias (EPIs, brinquedos, eletrodomésticos…) e vincule ' +
    'a cada uma a trilha do catálogo que descreve o processo dela.',
};

const TRILHA_PADRAO = {
  nome: 'Certificação padrão',
  descricao:
    'Processo genérico de certificação: análise documental, ensaios, auditoria ' +
    'de fábrica e decisão. Duplique-a para montar variações por família de produto.',
};

/** Etapas da versão 1 da trilha padrão. */
const ETAPAS: Array<{
  nome: string;
  descricao: string;
  ordem: number;
  tipo: TipoEtapa;
  exigeDocumento?: boolean;
}> = [
  {
    nome: 'Análise documental',
    descricao:
      'Conferência da documentação técnica do produto, memorial descritivo e dados do fabricante.',
    ordem: 1,
    tipo: TipoEtapa.DOCUMENTAL,
    exigeDocumento: true,
  },
  {
    nome: 'Ensaios laboratoriais',
    descricao:
      'Execução dos ensaios previstos na norma aplicável em laboratório acreditado.',
    ordem: 2,
    tipo: TipoEtapa.ENSAIO,
    exigeDocumento: true,
  },
  {
    nome: 'Auditoria de fábrica',
    descricao:
      'Avaliação do processo produtivo e do sistema de controle da qualidade do fabricante.',
    ordem: 3,
    tipo: TipoEtapa.AUDITORIA_FABRICA,
  },
  {
    nome: 'Emissão do certificado',
    descricao:
      'Análise crítica final, decisão sobre a certificação e emissão do certificado de conformidade.',
    ordem: 4,
    tipo: TipoEtapa.DECISAO,
  },
];

async function main(): Promise<void> {
  console.log('🌱 Iniciando seed...');

  // --- Estados -------------------------------------------------------------
  for (const estado of ESTADOS) {
    await prisma.estado.upsert({
      where: { sigla: estado.sigla },
      update: { nome: estado.nome },
      create: estado,
    });
  }
  console.log(`   ✔ ${ESTADOS.length} unidades federativas`);

  // --- Trilha padrão, sua versão 1 e a categoria que a usa -----------------
  // A trilha é do CATÁLOGO e a categoria aponta para ela. A "Geral" existe para
  // que uma base nova já consiga receber produtos sem configuração prévia.
  const trilha = await prisma.trilha.upsert({
    where: { nome: TRILHA_PADRAO.nome },
    update: { descricao: TRILHA_PADRAO.descricao },
    create: TRILHA_PADRAO,
  });

  const modeloExistente = await prisma.modeloTrilha.findUnique({
    where: { trilhaId_versao: { trilhaId: trilha.id, versao: 1 } },
    include: { _count: { select: { etapas: true } } },
  });

  if (!modeloExistente) {
    await prisma.modeloTrilha.create({
      data: { trilhaId: trilha.id, versao: 1, ativo: true, etapas: { create: ETAPAS } },
    });
    console.log(`   ✔ Trilha "${trilha.nome}" v1 (${ETAPAS.length} etapas)`);
  } else {
    // Versão já existente não é reescrita: ela pode ter produtos vinculados.
    console.log(
      `   ✔ Trilha "${trilha.nome}" já possui a v1 (${modeloExistente._count.etapas} etapas)`,
    );
  }

  /*
   * O vínculo entra só no `create`. Reapontar a categoria a cada `npm run seed`
   * desfaria, em silêncio, uma troca de trilha feita de propósito no painel —
   * e o seed é idempotente justamente para poder ser rodado sem medo.
   */
  const categoria = await prisma.categoriaProduto.upsert({
    where: { nome: CATEGORIA_PADRAO.nome },
    update: { descricao: CATEGORIA_PADRAO.descricao },
    create: { ...CATEGORIA_PADRAO, trilhaId: trilha.id },
  });
  console.log(`   ✔ Categoria "${categoria.nome}"`);

  // --- Administrador inicial ----------------------------------------------
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@procertocp.com.br';
  const senha = process.env.SEED_ADMIN_PASSWORD ?? 'Procert@2026';
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
  const senhaHash = await bcrypt.hash(senha, saltRounds);

  const sp = await prisma.estado.findUnique({ where: { sigla: 'SP' } });

  await prisma.funcionario.upsert({
    where: { email },
    // `update: {}` é deliberado: reexecutar o seed não pode resetar a senha de
    // um admin em produção a cada deploy. Em troca, uma vez criado o registro
    // o seed nunca mais corrige a senha — se o banco foi semeado com outro
    // SEED_ADMIN_PASSWORD, o login devolve 401 e a saída é
    // `npm run senha:admin` (prisma/redefinir-senha-admin.ts).
    update: {},
    create: {
      nome: 'Administrador ProCert',
      email,
      senhaHash,
      role: Role.ADMIN,
      tipoPessoa: TipoPessoa.FISICA,
      cidade: 'São Paulo',
      estadoId: sp?.id ?? null,
    },
  });
  console.log(`   ✔ Administrador: ${email} / ${senha}`);

  console.log('✅ Seed concluído.');
}

main()
  .catch((error) => {
    console.error('❌ Falha no seed:', error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
