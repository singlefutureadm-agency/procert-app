import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { mockDeep } from 'jest-mock-extended';

import { CertificadosService } from './certificados.service';
import { ExpiracaoCertificadosCron } from './expiracao.cron';

describe('ExpiracaoCertificadosCron', () => {
  let cron: ExpiracaoCertificadosCron;
  let certificados: jest.Mocked<CertificadosService>;
  let config: jest.Mocked<ConfigService>;
  let log: jest.SpyInstance;
  let aviso: jest.SpyInstance;
  let erro: jest.SpyInstance;

  function montar(variaveis: Record<string, string> = {}) {
    certificados = mockDeep<CertificadosService>();
    config = mockDeep<ConfigService>();
    config.get.mockImplementation(
      (chave: string, padrao?: unknown) => (variaveis[chave] ?? padrao) as never,
    );

    cron = new ExpiracaoCertificadosCron(certificados, config);
    log = jest.spyOn(cron['logger'], 'log').mockImplementation(() => undefined);
    aviso = jest.spyOn(cron['logger'], 'warn').mockImplementation(() => undefined);
    erro = jest.spyOn(cron['logger'], 'error').mockImplementation(() => undefined);
    return cron;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ligado por padrão', () => {
    it('sem EXPIRACAO_CRON_ATIVA no ambiente, roda', async () => {
      montar();
      certificados.expirarVencidos.mockResolvedValue({
        mensagem: '3 certificado(s) marcado(s) como vencido(s).',
        atualizados: 3,
      });

      await cron.executar();

      // Instalação nova não pode exibir certificado vencido como se valesse.
      expect(certificados.expirarVencidos).toHaveBeenCalledTimes(1);
    });

    it('chama o service DIRETO, sem passar por HTTP', () => {
      montar();

      // O provider depende do service, não de um cliente HTTP nem de um token.
      // É o que dispensa a credencial de serviço do cron externo.
      expect(certificados.expirarVencidos).toBeDefined();
      expect(Object.keys(cron)).not.toContain('http');
    });
  });

  describe('registro do resultado', () => {
    it('loga a mensagem mesmo quando não há nada a expirar', async () => {
      montar();
      certificados.expirarVencidos.mockResolvedValue({
        mensagem: 'Nenhum certificado vencido a atualizar.',
        atualizados: 0,
      });

      await cron.executar();

      // É assim que se distingue "rodou e não achou nada" de "não rodou" — o
      // problema exato que o agendamento existe para resolver.
      expect(log).toHaveBeenCalledWith(
        'Expiração automática: Nenhum certificado vencido a atualizar.',
      );
      expect(aviso).not.toHaveBeenCalled();
    });

    it('quando expira algo, além do log emite um aviso com a contagem', async () => {
      montar();
      certificados.expirarVencidos.mockResolvedValue({
        mensagem: '3 certificado(s) marcado(s) como vencido(s).',
        atualizados: 3,
      });

      await cron.executar();

      expect(log).toHaveBeenCalledWith(
        'Expiração automática: 3 certificado(s) marcado(s) como vencido(s).',
      );
      expect(aviso).toHaveBeenCalledWith(
        expect.stringContaining('3 certificado(s) passaram a constar como VENCIDO'),
      );
    });
  });

  describe('EXPIRACAO_CRON_ATIVA=false', () => {
    it('não executa nada', async () => {
      montar({ EXPIRACAO_CRON_ATIVA: 'false' });

      await cron.executar();

      expect(certificados.expirarVencidos).not.toHaveBeenCalled();
    });

    it('avisa no boot que está desligada, apontando a rota manual', () => {
      montar({ EXPIRACAO_CRON_ATIVA: 'false' });

      cron.onModuleInit();

      // Desligado em silêncio seria pior do que o problema original: ninguém
      // descobriria por que os vencidos param de ser marcados.
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('DESLIGADA (EXPIRACAO_CRON_ATIVA=false)'),
      );
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('POST /certificados/expirar-vencidos'),
      );
    });

    it('qualquer outro valor mantém ligado — só "false" desliga', async () => {
      montar({ EXPIRACAO_CRON_ATIVA: 'sim' });
      certificados.expirarVencidos.mockResolvedValue({
        mensagem: 'Nenhum certificado vencido a atualizar.',
        atualizados: 0,
      });

      await cron.executar();

      expect(certificados.expirarVencidos).toHaveBeenCalled();
    });
  });

  describe('resiliência', () => {
    it('falha do service NÃO propaga — não pode derrubar o processo da API', async () => {
      montar();
      certificados.expirarVencidos.mockRejectedValue(
        new Error('conexão com o banco perdida'),
      );

      await expect(cron.executar()).resolves.toBeUndefined();
      expect(erro).toHaveBeenCalledWith(
        expect.stringContaining('conexão com o banco perdida'),
      );
    });

    it('rodar duas vezes seguidas é inofensivo (multi-instância)', async () => {
      montar();
      certificados.expirarVencidos
        .mockResolvedValueOnce({
          mensagem: '2 certificado(s) marcado(s) como vencido(s).',
          atualizados: 2,
        })
        .mockResolvedValueOnce({
          mensagem: 'Nenhum certificado vencido a atualizar.',
          atualizados: 0,
        });

      await cron.executar();
      await cron.executar();

      // O `where` do updateMany já exclui o que a primeira passada mudou.
      expect(erro).not.toHaveBeenCalled();
      expect(aviso).toHaveBeenCalledTimes(1);
    });
  });

  describe('registro do job no ScheduleModule', () => {
    it('o @Cron entra no SchedulerRegistry com o nome esperado', async () => {
      // Este é o único caso que levanta o Nest: instanciar a classe na mão não
      // registra decorator nenhum, então sem isto um `@Cron` removido por
      // acidente passaria despercebido — que é justamente a regressão que esta
      // entrega existe para impedir.
      const modulo = await Test.createTestingModule({
        imports: [
          (await import('@nestjs/schedule')).ScheduleModule.forRoot(),
        ],
        providers: [
          ExpiracaoCertificadosCron,
          { provide: CertificadosService, useValue: mockDeep<CertificadosService>() },
          {
            provide: ConfigService,
            useValue: { get: (_: string, padrao?: unknown) => padrao },
          },
        ],
      }).compile();

      const app = modulo.createNestApplication();
      await app.init();

      const registro = app.get(SchedulerRegistry);
      expect(registro.doesExist('cron', 'expirar-certificados-vencidos')).toBe(
        true,
      );

      await app.close();
    });
  });
});
