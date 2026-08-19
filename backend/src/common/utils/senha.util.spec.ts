import { conferirSenha, gerarHashSenha, SENHA_REGEX } from './senha.util';

/**
 * Compatibilidade com os usuários herdados do PHP.
 *
 * O legado gravava com `password_hash()`, que emite o prefixo `$2y$`; o Node
 * emite `$2b$`. Os dois descrevem o mesmo algoritmo, e `conferirSenha`
 * normaliza um no outro antes de comparar. Sem isso, todo cliente migrado
 * perderia o acesso — silenciosamente, com a mesma mensagem de "senha
 * incorreta" de quem realmente errou a senha.
 *
 * O upgrade `bcrypt` 5 → 6 (commit ed279ee) mexeu justamente na camada nativa
 * que faz essa comparação. Este arquivo é a rede que trava o comportamento: a
 * verificação anterior foi feita à mão, uma vez, e não protege o próximo
 * upgrade.
 *
 * O vetor é o da documentação do PHP: `password_hash("rasmuslerdorf",
 * PASSWORD_DEFAULT)`.
 */
const HASH_PHP_2Y = '$2y$10$.vGA1O9wmRjrwAVXD98HNOgsNpDczlqm3Jq7KnEd1rVAGv3Fykk1a';
const SENHA_DO_HASH_PHP = 'rasmuslerdorf';

// bcrypt é nativo e o custo 12 do projeto é intencionalmente lento.
jest.setTimeout(30_000);

describe('senha.util', () => {
  describe('conferirSenha — hash $2y$ vindo do PHP legado', () => {
    it('aceita a senha correta contra o hash $2y$', async () => {
      await expect(conferirSenha(SENHA_DO_HASH_PHP, HASH_PHP_2Y)).resolves.toBe(
        true,
      );
    });

    it('recusa a senha errada contra o mesmo hash $2y$', async () => {
      await expect(conferirSenha('senhaErrada1', HASH_PHP_2Y)).resolves.toBe(
        false,
      );
    });

    it('recusa quando o $2y$ NÃO é normalizado — prova que a normalização é o que faz funcionar', async () => {
      // Chamando o bcrypt sem passar por `conferirSenha`, o mesmo par
      // senha/hash dá `false`. É esta linha que dá sentido às duas de cima: sem
      // ela, elas passariam mesmo que a normalização fosse removida e o bcrypt
      // passasse a entender `$2y$` sozinho.
      const bcrypt = await import('bcrypt');
      await expect(bcrypt.compare(SENHA_DO_HASH_PHP, HASH_PHP_2Y)).resolves.toBe(
        false,
      );
    });
  });

  describe('gerarHashSenha — hashes novos', () => {
    it('emite hash com o prefixo $2b$ e o confere de volta', async () => {
      const hash = await gerarHashSenha('SenhaNova123');

      expect(hash.startsWith('$2b$')).toBe(true);
      await expect(conferirSenha('SenhaNova123', hash)).resolves.toBe(true);
      await expect(conferirSenha('SenhaNova124', hash)).resolves.toBe(false);
    });

    it('confere um hash novo mesmo se ele for reescrito com prefixo $2y$', async () => {
      // O caminho inverso da migração: garante que a normalização não depende
      // da origem do hash, só do prefixo.
      const hash = await gerarHashSenha('SenhaNova123');
      const comoPhp = hash.replace(/^\$2b\$/, '$2y$');

      await expect(conferirSenha('SenhaNova123', comoPhp)).resolves.toBe(true);
    });

    it('gera hashes diferentes para a mesma senha (salt por hash)', async () => {
      const [a, b] = await Promise.all([
        gerarHashSenha('SenhaNova123'),
        gerarHashSenha('SenhaNova123'),
      ]);

      expect(a).not.toBe(b);
    });
  });

  describe('SENHA_REGEX — política de senha (o legado não tinha nenhuma)', () => {
    it.each([
      ['Procert2026', true],
      ['abc12345', true],
      ['senhacomacento1ç', true],
      ['curta1', false],
      ['semnumeros', false],
      ['12345678', false],
      ['', false],
    ])('%s → %s', (senha, esperado) => {
      expect(SENHA_REGEX.test(senha)).toBe(esperado);
    });
  });
});
