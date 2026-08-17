import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import {
  PASTAS_PUBLICAS,
  PASTAS_UPLOAD,
  ehPastaPublica,
} from './modules/uploads/uploads.constantes';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(ConfigService);
  const prefix = config.get<string>('API_PREFIX', 'api');
  const port = config.get<number>('PORT', 3000);
  const uploadDir = config.get<string>('UPLOAD_DIR', './uploads');

  app.setGlobalPrefix(prefix);

  // Cabeçalhos de segurança (o legado não tinha nenhum).
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.enableCors({
    origin: config
      .get<string>('CORS_ORIGINS', 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim()),
    credentials: true,
  });

  // Validação e sanitização automáticas de todo payload de entrada.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  // Arquivos enviados pelos usuários.
  //
  // Todas as pastas são criadas no boot, públicas e privadas: os métodos do
  // UploadsService já fazem `mkdir` recursivo na gravação, mas manter a criação
  // aqui preserva o comportamento anterior (diretório existente desde a subida)
  // e evita que o estático de uma pasta pública aponte para caminho inexistente.
  const raizUploads = join(process.cwd(), uploadDir);
  mkdirSync(raizUploads, { recursive: true });
  for (const pasta of PASTAS_UPLOAD) {
    mkdirSync(join(raizUploads, pasta), { recursive: true });
  }

  // Nega tudo que não seja pasta pública, ANTES de qualquer mount estático.
  //
  // Só deixar de montar `certificados/` e `certificacoes/` já resultaria em 404
  // (a requisição cairia no roteador do Nest, que não tem rota para /uploads),
  // mas seria um 404 por acidente de roteamento. O middleware torna a negação
  // explícita, devolve o mesmo corpo de erro do resto da API e — por estar
  // registrado antes — continua valendo se alguém remontar o diretório inteiro
  // como estático no futuro.
  app.use(
    '/uploads',
    (req: Request, res: Response, proximo: NextFunction): void => {
      const pasta = req.path.split('/').filter(Boolean)[0];

      if (!pasta || !ehPastaPublica(pasta)) {
        res.status(404).json({
          statusCode: 404,
          message: 'Arquivo não encontrado.',
          error: 'Not Found',
          path: req.originalUrl,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      proximo();
    },
  );

  // Um mount por pasta pública. PDF de certificado e evidência de etapa ficam
  // de fora de propósito: saem só por /certificados/:id/pdf e
  // /certificacoes/documentos/:id/arquivo, que verificam a posse.
  for (const pasta of PASTAS_PUBLICAS) {
    app.useStaticAssets(join(raizUploads, pasta), {
      prefix: `/uploads/${pasta}/`,
      index: false,
    });
  }

  // Documentação da API.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ProCert API')
    .setDescription(
      'API da plataforma de certificação de produtos ProCert. ' +
        'Migração do sistema PHP legado para NestJS + PostgreSQL.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${prefix}/docs`, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(port);
  console.log(`🚀 API:     http://localhost:${port}/${prefix}`);
  console.log(`📚 Swagger: http://localhost:${port}/${prefix}/docs`);
}

void bootstrap();
