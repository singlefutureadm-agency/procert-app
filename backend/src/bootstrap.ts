import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import {
  PASTAS_PUBLICAS,
  PASTAS_UPLOAD,
  pastaPublicaDaRota,
} from './modules/uploads/uploads.constantes';

/**
 * Toda a configuração da aplicação, fora do `main.ts`.
 *
 * Existe para que o e2e levante **a mesma aplicação que roda em produção**. Com
 * isso vivendo só no `main.ts`, o `Test.createTestingModule` produziria um app
 * sem prefixo, sem `ValidationPipe`, sem o filtro de exceções e — o pior — sem
 * os mounts de `/uploads`: justamente as peças que os testes de autorização
 * precisam exercitar. Um e2e assim validaria uma aplicação que não existe.
 *
 * A ordem das chamadas importa e está documentada em `DOCUMENTACAO.md` §9.
 */
export function configurarApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  const prefix = config.get<string>('API_PREFIX', 'api');
  const uploadDir = config.get<string>('UPLOAD_DIR', './uploads');

  validarSegredosDeProducao(config);

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
  // `forbidNonWhitelisted` é o que mata mass-assignment: campo fora do DTO → 400.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  configurarEstaticos(app, uploadDir);
}

/**
 * Recusa subir em produção com o segredo de exemplo.
 *
 * `JWT_SECRET` já é lido com `getOrThrow`, então ausência quebra alto. O que
 * passava calado era o valor DE EXEMPLO: quem copia `.env.example` para `.env`
 * no servidor e esquece esta linha fica com um segredo que está publicado no
 * repositório — e quem o tiver assina um token de ADMIN sozinho, sem precisar
 * de senha nenhuma. É a falha mais barata de cometer no dia do deploy e a mais
 * cara de descobrir depois.
 *
 * Só vale em produção: o `.env.test` do e2e e o `.env` de desenvolvimento usam
 * segredos curtos de propósito, e travar lá só criaria atrito sem ganho.
 */
function validarSegredosDeProducao(config: ConfigService): void {
  if (config.get<string>('NODE_ENV') !== 'production') return;

  const segredo = config.get<string>('JWT_SECRET', '');
  const problemas: string[] = [];

  if (segredo.includes('troque-este-valor')) {
    problemas.push(
      'JWT_SECRET ainda está com o valor de exemplo do .env.example.',
    );
  }
  if (segredo.length < 32) {
    problemas.push('JWT_SECRET tem menos de 32 caracteres.');
  }

  if (problemas.length > 0) {
    throw new Error(
      [
        'Configuração insegura para produção:',
        ...problemas.map((p) => `  - ${p}`),
        '',
        'Gere um segredo novo com:',
        `  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`,
        '',
        'Trocar o JWT_SECRET invalida as sessões abertas — todos precisarão',
        'entrar de novo. Em produção isso é aceitável; é o efeito esperado.',
      ].join('\n'),
    );
  }
}

/**
 * Arquivos enviados pelos usuários.
 *
 * Todas as pastas são criadas no boot, públicas e privadas: os métodos do
 * UploadsService já fazem `mkdir` recursivo na gravação, mas manter a criação
 * aqui preserva o comportamento anterior (diretório existente desde a subida) e
 * evita que o estático de uma pasta pública aponte para caminho inexistente.
 */
function configurarEstaticos(
  app: NestExpressApplication,
  uploadDir: string,
): void {
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
  //
  // `pastaPublicaDaRota` decodifica o caminho antes de olhar a allowlist: a
  // decisão precisa ser tomada sobre o mesmo texto que o `serve-static` usa para
  // resolver o arquivo em disco.
  app.use(
    '/uploads',
    (req: Request, res: Response, proximo: NextFunction): void => {
      if (pastaPublicaDaRota(req.path) === null) {
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
}

/**
 * Documentação da API.
 *
 * Fora de `configurarApp` de propósito: o e2e não precisa dela, e montá-la
 * custa a varredura de todos os controllers a cada suíte.
 */
export function configurarSwagger(
  app: NestExpressApplication,
  prefix: string,
): void {
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
}
