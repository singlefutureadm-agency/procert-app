import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  ExpressAdapter,
  NestExpressApplication,
} from '@nestjs/platform-express';
import express, { type Express } from 'express';

import { AppModule } from './app.module';
import { configurarApp, configurarSwagger } from './bootstrap';

/**
 * A aplicação como *função*, para hospedagem serverless (Vercel).
 *
 * O `main.ts` continua sendo o caminho de um servidor de verdade: ele abre a
 * porta e fica de pé. Aqui não há porta — a plataforma entrega uma requisição
 * por vez a um handler, e o processo pode ser destruído entre duas delas.
 *
 * O que os dois têm em comum é `configurarApp`, a mesma função que o e2e usa.
 * Isso é o ponto: prefixo, helmet, CORS, ValidationPipe, filtro de exceções e a
 * allowlist de `/uploads` são idênticos nos três ambientes. Um segundo bootstrap
 * escrito "só para produção" é como se perde a paridade que o `bootstrap.ts`
 * existe para garantir.
 */

/**
 * A instância sobrevive entre invocações da mesma instância quente.
 *
 * É promessa, e não objeto pronto, de propósito: duas requisições podem chegar
 * antes de a primeira terminar de subir o Nest, e guardar a promessa faz a
 * segunda esperar a mesma inicialização em vez de começar outra. Com o Prisma
 * no meio, "outra" significaria um segundo pool de conexões no mesmo processo.
 */
let instancia: Promise<Express> | null = null;

async function criar(): Promise<Express> {
  const servidor = express();

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(servidor),
    { logger: ['error', 'warn'] },
  );

  configurarApp(app);

  // Swagger segue a mesma regra do `main.ts`: fora do ar em produção, a menos
  // que SWAGGER_ATIVO diga o contrário.
  const config = app.get(ConfigService);
  const swaggerAtivo =
    config.get<string>('SWAGGER_ATIVO') !== undefined
      ? config.get<string>('SWAGGER_ATIVO') === 'true'
      : config.get<string>('NODE_ENV', 'development') !== 'production';

  if (swaggerAtivo) {
    configurarSwagger(app, config.get<string>('API_PREFIX', 'api'));
  }

  // `init()`, não `listen()`: quem escuta a porta é a plataforma.
  await app.init();

  return servidor;
}

/** Handler no formato que a Vercel espera (`(req, res)`). */
export async function handler(
  req: express.Request,
  res: express.Response,
): Promise<void> {
  instancia ??= criar();
  const servidor = await instancia;
  servidor(req, res);
}

export default handler;
