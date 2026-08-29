import { join } from 'node:path';
import {
  compararMigrations,
  migrationsAplicadas,
  migrationsNoDisco,
} from './migrations-pendentes';

describe('migrations-pendentes', () => {
  describe('compararMigrations', () => {
    it('devolve o que está no disco e não no banco, na ordem do disco', () => {
      const pendentes = compararMigrations(
        ['20260812034301_init', '20260824120000_ultimo_acesso', '20260825224421_carteira'],
        ['20260812034301_init'],
      );

      expect(pendentes).toEqual([
        '20260824120000_ultimo_acesso',
        '20260825224421_carteira',
      ]);
    });

    it('devolve vazio quando o banco está em dia', () => {
      expect(
        compararMigrations(['a', 'b'], ['b', 'a']),
      ).toEqual([]);
    });

    /**
     * Trocar para uma branch mais antiga deixa o banco com uma migration que o
     * disco não tem. Não é problema — o código simplesmente ignora a coluna a
     * mais. Reclamar disso faria a guarda gritar a cada `git checkout`.
     */
    it('ignora migration aplicada que não está mais no disco', () => {
      expect(compararMigrations(['a'], ['a', 'z_de_outra_branch'])).toEqual([]);
    });
  });

  describe('migrationsAplicadas', () => {
    it('extrai os nomes das linhas devolvidas', async () => {
      const consultar = jest
        .fn()
        .mockResolvedValue([
          { migration_name: 'a' },
          { migration_name: 'b' },
        ]);

      await expect(migrationsAplicadas(consultar)).resolves.toEqual(['a', 'b']);
    });

    /**
     * Banco novo, sem `_prisma_migrations`: a resposta certa é "nenhuma
     * aplicada", não uma exceção que derrubaria o boot antes de a guarda poder
     * dizer o que fazer.
     */
    it('trata tabela inexistente como nenhuma migration aplicada (code direto)', async () => {
      const consultar = jest.fn().mockRejectedValue({ code: '42P01' });

      await expect(migrationsAplicadas(consultar)).resolves.toEqual([]);
    });

    it('trata tabela inexistente também quando o código vem em meta.code', async () => {
      const consultar = jest.fn().mockRejectedValue({ code: 'P2010', meta: { code: '42P01' } });

      await expect(migrationsAplicadas(consultar)).resolves.toEqual([]);
    });

    /**
     * Qualquer outra falha (credencial errada, banco fora do ar) precisa subir:
     * engoli-la faria a guarda anunciar "tudo em dia" justamente quando não
     * conseguiu olhar.
     */
    it('propaga erro que não seja tabela inexistente', async () => {
      const consultar = jest.fn().mockRejectedValue({ code: '28P01' });

      await expect(migrationsAplicadas(consultar)).rejects.toMatchObject({
        code: '28P01',
      });
    });
  });

  describe('migrationsNoDisco', () => {
    it('devolve vazio quando o diretório não existe', () => {
      expect(migrationsNoDisco(join(__dirname, 'nao-existe-mesmo'))).toEqual([]);
    });

    it('lê as migrations reais do repositório, sem o migration_lock.toml', () => {
      const nomes = migrationsNoDisco(
        join(__dirname, '..', '..', 'prisma', 'migrations'),
      );

      expect(nomes).toContain('20260812034301_init');
      expect(nomes).not.toContain('migration_lock.toml');
      // Ordenado: é a ordem cronológica em que o Prisma as aplicaria.
      expect([...nomes].sort()).toEqual(nomes);
    });
  });
});
