import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import * as httpNativo from 'node:http';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../../src/app.module';
import { configurarApp } from '../../src/bootstrap';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Levanta a aplicação sob teste.
 *
 * `configurarApp` é a MESMA função que o `main.ts` chama: prefixo, helmet,
 * CORS, `ValidationPipe` com `whitelist` + `forbidNonWhitelisted`, filtro global
 * de exceções e os mounts de `/uploads`. Sem isso o e2e validaria uma aplicação
 * que não existe — e justamente as peças que estes testes exercitam ficariam de
 * fora.
 */
export async function criarApp(): Promise<NestExpressApplication> {
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = modulo.createNestApplication<NestExpressApplication>({
    // Silencia o log de boot; o que interessa é o corpo das respostas.
    logger: false,
  });

  configurarApp(app);
  await app.init();
  // Porta efêmera: o supertest dispensa, mas `requisicaoCrua` precisa de um
  // socket de verdade para enviar um caminho que o parser de URL recusaria.
  await app.listen(0);

  return app;
}

/**
 * Requisição com o caminho enviado LITERALMENTE, sem normalização — o
 * equivalente ao `curl --path-as-is`.
 *
 * Existe porque todo cliente HTTP que segue a especificação de URL resolve os
 * segmentos `.` e `..` antes de abrir a conexão, **inclusive quando escritos
 * como `%2e%2e`**: o supertest transforma
 * `/uploads/produtos/%2e%2e/%2e%2e/certificados/x.pdf` em
 * `/certificados/x.pdf` e o request nem chega perto de `/uploads`. O 404 seria
 * real e não provaria nada sobre o servidor.
 *
 * O `http.request` do Node envia `path` verbatim, que é o que um atacante com
 * um socket na mão faria.
 */
export function requisicaoCrua(
  app: INestApplication,
  caminho: string,
): Promise<{ status: number; corpo: string; caminhoEnviado: string }> {
  const servidor = app.getHttpServer() as { address(): { port: number } };
  const { port } = servidor.address();

  return new Promise((resolver, rejeitar) => {
    const requisicao = httpNativo.request(
      { host: '127.0.0.1', port, method: 'GET', path: caminho },
      (resposta) => {
        let corpo = '';
        resposta.setEncoding('utf8');
        resposta.on('data', (parte: string) => (corpo += parte));
        resposta.on('end', () =>
          resolver({
            status: resposta.statusCode ?? 0,
            corpo,
            caminhoEnviado: caminho,
          }),
        );
      },
    );

    requisicao.on('error', rejeitar);
    requisicao.end();
  });
}

export function prisma(app: INestApplication): PrismaService {
  return app.get(PrismaService);
}

export function http(app: INestApplication) {
  return request(app.getHttpServer() as App);
}

/** Faz login de verdade e devolve o `Bearer` — o mesmo caminho do usuário. */
export async function autenticar(
  app: INestApplication,
  email: string,
  senha: string,
): Promise<string> {
  const resposta = await http(app)
    .post('/api/auth/login')
    .send({ email, senha });

  if (resposta.status !== 200 && resposta.status !== 201) {
    throw new Error(
      `Login de ${email} falhou no cenário de teste: ` +
        `${resposta.status} ${JSON.stringify(resposta.body)}`,
    );
  }

  return `Bearer ${(resposta.body as { accessToken: string }).accessToken}`;
}
