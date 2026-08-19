import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { configurarApp, configurarSwagger } from './bootstrap';

/**
 * Sobe a API.
 *
 * Fino de propósito: toda a configuração (prefixo, helmet, CORS, ValidationPipe,
 * filtro de exceções, estáticos de `/uploads`) mora em `bootstrap.ts`, para que
 * o e2e levante exatamente a mesma aplicação. Aqui ficam só as decisões que são
 * do processo — porta, logger e documentação.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  configurarApp(app);

  const config = app.get(ConfigService);
  const prefix = config.get<string>('API_PREFIX', 'api');
  const port = config.get<number>('PORT', 3000);

  configurarSwagger(app, prefix);

  await app.listen(port);
  console.log(`🚀 API:     http://localhost:${port}/${prefix}`);
  console.log(`📚 Swagger: http://localhost:${port}/${prefix}/docs`);
}

void bootstrap();
