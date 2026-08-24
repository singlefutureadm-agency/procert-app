import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mockDeep } from 'jest-mock-extended';

import { CertificadosService } from './certificados.service';
import { ExpiracaoCronController } from './expiracao.cron.controller';

const SEGREDO = 'segredo-do-agendador-com-tamanho-decente';

describe('ExpiracaoCronController', () => {
  let controller: ExpiracaoCronController;
  let certificados: jest.Mocked<CertificadosService>;

  function montar(valores: Record<string, string>) {
    const config = mockDeep<ConfigService>();
    config.get.mockImplementation(
      (chave: string, padrao?: unknown) => (valores[chave] ?? padrao) as never,
    );

    certificados = mockDeep<CertificadosService>();
    certificados.expirarVencidos.mockResolvedValue({
      mensagem: '2 certificado(s) marcados como VENCIDO.',
      atualizados: 2,
    });

    controller = new ExpiracaoCronController(certificados, config);
  }

  beforeEach(() => montar({ CRON_SECRET: SEGREDO }));

  it('executa a expiração com o segredo correto', async () => {
    const resultado = await controller.expirarVencidos(`Bearer ${SEGREDO}`);

    expect(resultado.atualizados).toBe(2);
    expect(certificados.expirarVencidos).toHaveBeenCalledTimes(1);
  });

  it('aceita o segredo sem o prefixo Bearer', async () => {
    // O Vercel Cron manda `Bearer <CRON_SECRET>`, mas um agendador externo
    // qualquer pode mandar o valor cru. Aceitar os dois não afrouxa nada: o que
    // é comparado é o segredo, não a moldura.
    await controller.expirarVencidos(SEGREDO);

    expect(certificados.expirarVencidos).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['só o prefixo', 'Bearer '],
    ['errado', 'Bearer segredo-errado'],
    ['prefixo correto do segredo', `Bearer ${SEGREDO.slice(0, -1)}`],
    ['segredo com sufixo', `Bearer ${SEGREDO}x`],
  ])('recusa cabeçalho %s sem tocar no banco', async (_, cabecalho) => {
    await expect(controller.expirarVencidos(cabecalho)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    // O ponto do teste não é o 401: é que a rotina de negócio não roda.
    expect(certificados.expirarVencidos).not.toHaveBeenCalled();
  });

  it('sem CRON_SECRET configurado a rota fica FECHADA, não aberta', async () => {
    // Um deploy sem a variável tem de falhar visível no log do agendador, e
    // nunca executar rotina de negócio para quem quer que peça.
    montar({});

    await expect(controller.expirarVencidos('Bearer o-que-for')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(controller.expirarVencidos(undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(certificados.expirarVencidos).not.toHaveBeenCalled();
  });

  it('a mensagem de erro não distingue segredo errado de segredo ausente', async () => {
    // Mesma disciplina do login: a resposta não conta ao chamador em que pé ele
    // está.
    const semConfigurar = montar({}) as unknown;
    void semConfigurar;
    const semSegredo = await controller
      .expirarVencidos('Bearer x')
      .catch((e: Error) => e.message);

    montar({ CRON_SECRET: SEGREDO });
    const errado = await controller
      .expirarVencidos('Bearer y')
      .catch((e: Error) => e.message);

    expect(semSegredo).toBe(errado);
  });
});
