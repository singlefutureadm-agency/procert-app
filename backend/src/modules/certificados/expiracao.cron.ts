import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import { CertificadosService } from './certificados.service';

/**
 * Marca como `VENCIDO` os certificados fora da validade, uma vez por dia.
 *
 * Por que dentro da API e não num cron externo chamando a rota HTTP:
 *
 * O cron externo precisaria de um token de ADMIN de longa duração guardado numa
 * variável de ambiente do agendador. Isso é uma credencial de serviço com poder
 * total sobre a API — pode excluir cliente, emitir e cancelar certificado — vivendo
 * fora do sistema, sem rotação e sem revogação (a sessão hoje não tem lista de
 * revogação; ver §15, "Modelo de sessão"). Trocar essa exposição por um
 * `updateMany` diário resolvido em processo é o negócio melhor.
 *
 * O custo é o inverso: com múltiplas instâncias da API, o job dispara em todas.
 * É tolerável porque `expirarVencidos` é um único `updateMany` idempotente, com
 * `where` que já exclui o que ele acabou de mudar — a segunda execução afeta
 * zero linhas e devolve "Nenhum certificado vencido a atualizar". Ainda assim
 * não é gratuito (N conexões e N linhas de log), e por isso o comportamento é
 * controlado por `EXPIRACAO_CRON_ATIVA`: ao passar a rodar em mais de uma
 * instância, deixe `true` em exatamente uma.
 *
 * A rota `POST /certificados/expirar-vencidos` continua existindo para
 * acionamento manual e para quem preferir o agendador externo.
 *
 * Este provider chama o service direto, sem passar por HTTP. É separado do
 * `CertificadosService` de propósito: agendamento é infraestrutura, e o service
 * continua testável sem levantar o Nest nem o `ScheduleModule`.
 */
@Injectable()
export class ExpiracaoCertificadosCron implements OnModuleInit {
  private readonly logger = new Logger(ExpiracaoCertificadosCron.name);

  constructor(
    private readonly certificados: CertificadosService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.ativo()) {
      this.logger.log(
        'Expiração automática de certificados DESLIGADA (EXPIRACAO_CRON_ATIVA=false). ' +
          'Use POST /certificados/expirar-vencidos.',
      );
    }
  }

  /**
   * 03:00 no fuso do processo — fora do horário de uso, e depois da virada do
   * dia, para que um certificado que vence hoje só seja marcado amanhã.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'expirar-certificados-vencidos',
  })
  async executar(): Promise<void> {
    if (!this.ativo()) return;

    try {
      const { mensagem, atualizados } =
        await this.certificados.expirarVencidos();

      // Sempre em nível `log`, inclusive quando não há nada a fazer: é assim
      // que se distingue "a rotina rodou e não achou nada" de "a rotina não
      // rodou", que é o problema que esta entrega existe para resolver.
      this.logger.log(`Expiração automática: ${mensagem}`);

      if (atualizados > 0) {
        this.logger.warn(
          `${atualizados} certificado(s) passaram a constar como VENCIDO(S). ` +
            'Confira se algum deles deveria ter sido renovado.',
        );
      }
    } catch (erro) {
      // Uma falha aqui não pode derrubar o processo da API.
      this.logger.error(
        `Falha na expiração automática de certificados: ${(erro as Error).message}`,
      );
    }
  }

  /** Ligado por padrão: instalação nova expira sem precisar configurar nada. */
  private ativo(): boolean {
    return this.config.get<string>('EXPIRACAO_CRON_ATIVA', 'true') !== 'false';
  }
}
