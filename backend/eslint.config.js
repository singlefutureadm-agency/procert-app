/**
 * Flat config do ESLint 9 para o backend.
 *
 * Espelha `frontend/eslint.config.js`, sem as regras de React. A diferença de
 * forma é obrigatória: o `frontend/package.json` declara `"type": "module"` e o
 * do backend não, então aqui o arquivo precisa ser CommonJS.
 *
 * Sem regras type-aware (`parserOptions.project`) de propósito — ver o
 * comentário sobre `no-floating-promises` mais abaixo.
 */
const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');
const globals = require('globals');

module.exports = [
  {
    ignores: ['dist', 'node_modules', 'coverage', 'prisma/migrations'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,

      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // O TypeScript já resolve identificador inexistente, e a regra do ESLint
      // não conhece namespaces de tipo (`Express.Multer.File`) nem decorators.
      'no-undef': 'off',
    },
  },
];

/**
 * Sobre as regras type-aware, que ficaram DESLIGADAS:
 *
 * Ligar `parserOptions.project` traria `@typescript-eslint/no-floating-promises`,
 * que acusaria os envios de e-mail e a geração de PDF disparados sem `await`
 * depois do commit em `CertificacoesService` e `CertificadosService`. Aquilo é
 * decisão de arquitetura registrada — efeito colateral que não pode derrubar a
 * operação de domínio —, não descuido.
 *
 * O caminho correto, quando essas regras entrarem, é marcar cada chamada com
 * `void promessa` para declarar a intenção. NUNCA remover o comportamento para
 * agradar o linter: passar a esperar o e-mail devolveria ao usuário o tempo (e a
 * falha) do SMTP dentro da transação de negócio.
 *
 * Fica para uma entrega própria porque é varredura em código de negócio, não
 * configuração de ferramenta.
 */
