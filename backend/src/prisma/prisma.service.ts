import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  compararMigrations,
  diretorioDeMigrations,
  migrationsAplicadas,
  migrationsNoDisco,
} from './migrations-pendentes';

/**
 * Conexão única com o PostgreSQL, gerenciada pelo ciclo de vida do Nest.
 * Substitui o singleton estático de `core/Model.php` do legado.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['warn', 'error']
          : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.conferirMigrations();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Recusa subir com o banco local atrás do código — e a recusa é o ponto.
   *
   * Produção já tem esta guarda desde 26/08/2026, no build
   * (`prisma/migrar-no-deploy.js`), e a razão está escrita lá: "migration que
   * não aplicou não pode virar aviso no log — é exatamente assim que se chega
   * ao 500 de novo". Vale igual aqui. Num `nest start --watch` um aviso rola
   * para fora da tela no próximo arquivo salvo, e o desenvolvedor descobre a
   * defasagem horas depois, por um `P2022` que aponta para o código certo.
   *
   * SÓ EM `development`. Fora dele a função retorna antes de tocar no banco:
   *
   *  • em `production` a checagem custaria uma consulta a cada cold start em
   *    serverless, para responder algo que o build já garantiu;
   *  • em `test` o `globalSetup` do e2e aplica as migrations antes da suíte, e
   *    o `.env.test` fixa `NODE_ENV=test` — a guarda nunca corre ali.
   *
   * `CHECAR_MIGRATIONS=false` é a saída para quem precisar subir assim mesmo,
   * conscientemente. Sem essa válvula, uma guarda que erra vira um bloqueio sem
   * contorno, e a primeira reação seria arrancá-la.
   */
  private async conferirMigrations(): Promise<void> {
    if (process.env.NODE_ENV !== 'development') return;
    if (process.env.CHECAR_MIGRATIONS === 'false') return;

    const noDisco = migrationsNoDisco(diretorioDeMigrations());
    if (noDisco.length === 0) return;

    // `$queryRawUnsafe` com uma constante do módulo: não há interpolação nem
    // entrada de usuário em lugar nenhum desta consulta. O "Unsafe" do nome se
    // refere à ausência da tag de template, não a um risco aqui.
    const aplicadas = await migrationsAplicadas((sql) =>
      this.$queryRawUnsafe<Array<{ migration_name: string }>>(sql),
    );

    const pendentes = compararMigrations(noDisco, aplicadas);
    if (pendentes.length === 0) return;

    const lista = pendentes.map((nome) => `  - ${nome}`).join('\n');
    console.error(
      [
        '',
        '[migrations] O BANCO LOCAL ESTÁ ATRÁS DO CÓDIGO.',
        '',
        `Faltam aplicar ${pendentes.length} migration(s):`,
        lista,
        '',
        'Rode:  npm run setup',
        '',
        'A API não sobe assim de propósito. Ela funcionaria até a primeira',
        'query tocar uma coluna que ainda não existe, e o erro (P2022) acusaria',
        'o código — que está certo. Para subir mesmo assim: CHECAR_MIGRATIONS=false',
        '',
      ].join('\n'),
    );

    throw new Error(
      `Há ${pendentes.length} migration(s) pendente(s) no banco local. Rode "npm run setup".`,
    );
  }
}
