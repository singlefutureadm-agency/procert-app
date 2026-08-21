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

  /*
   * Swagger fica FORA do ar em produção por padrão.
   *
   * Ele é um mapa completo da API — todo endpoint, todo DTO, todo enum, toda
   * regra de validação — servido sem autenticação nenhuma. Em desenvolvimento é
   * a melhor ferramenta do projeto; publicado, é reconhecimento pronto para
   * quem for procurar. `SWAGGER_ATIVO` decide explicitamente nos dois sentidos,
   * para quem precisar dele num ambiente publicado e souber o que está fazendo.
   */
  const swaggerAtivo =
    config.get<string>('SWAGGER_ATIVO') !== undefined
      ? config.get<string>('SWAGGER_ATIVO') === 'true'
      : config.get<string>('NODE_ENV', 'development') !== 'production';

  if (swaggerAtivo) {
    configurarSwagger(app, prefix);
  }

  await app.listen(port);
  console.log(`🚀 API:     http://localhost:${port}/${prefix}`);
  console.log(`💓 Health:  http://localhost:${port}/${prefix}/health`);
  console.log(
    swaggerAtivo
      ? `📚 Swagger: http://localhost:${port}/${prefix}/docs`
      : '📚 Swagger: desligado (NODE_ENV=production). Ligue com SWAGGER_ATIVO=true.',
  );
}

void bootstrap();
