/**
 * Ponto de entrada da função na Vercel.
 *
 * É JavaScript, e não TypeScript, por um motivo concreto: a Vercel compila os
 * arquivos de `api/` com esbuild, que **não implementa `emitDecoratorMetadata`**.
 * Sem esses metadados o NestJS não consegue resolver dependência nenhuma por
 * tipo de construtor — o app sobe e quebra em "Nest can't resolve dependencies".
 *
 * Então a compilação continua sendo a do projeto (`nest build`, tsc de verdade,
 * rodada pelo `vercel-build`), e este arquivo só aponta para o `dist/`. Nada
 * aqui tem decorator, então não há metadado a perder.
 */
const { handler } = require('../dist/serverless');

module.exports = handler;
