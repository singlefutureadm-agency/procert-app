import {
  Controller,
  Get,
  Headers,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';

import { Public } from '../../common/decorators/public.decorator';
import { CertificadosService } from './certificados.service';

/**
 * Gatilho externo da expiração de certificados, para hospedagem serverless.
 *
 * Existe porque `ExpiracaoCertificadosCron` não roda em função: `@nestjs/schedule`
 * agenda um timer no processo, e num ambiente serverless não há processo entre
 * uma requisição e outra — o timer é criado no boot e destruído com a instância,
 * sem nunca chegar às 03:00. Por isso `EXPIRACAO_CRON_ATIVA=false` na Vercel, e
 * por isso quem acorda a rotina lá é o Vercel Cron, chamando esta rota.
 *
 * O comentário de `expiracao.cron.ts` recusa o agendador externo por um motivo
 * concreto: ele exigiria um token de ADMIN de longa duração guardado no
 * agendador — uma credencial de serviço capaz de excluir cliente e cancelar
 * certificado, sem rotação e sem revogação. Essa objeção continua de pé, e é
 * ela que dita o desenho aqui:
 *
 *  • O segredo é **dedicado** e não é uma sessão. Não sai do `JwtStrategy`, não
 *    vira `UsuarioAutenticado` e não passa pelo `RolesGuard`.
 *  • Ele abre **uma única porta**, que faz um `updateMany` idempotente derivado
 *    da data. Vazado, o estrago possível é disparar hoje o que ia rodar de
 *    madrugada.
 *  • Não recebe corpo nem parâmetro: não há o que injetar.
 *
 * O `POST /certificados/expirar-vencidos` (ADMIN) continua existindo para
 * acionamento manual — esta rota não o substitui.
 */
@ApiTags('Certificados')
@Controller('certificados/cron')
export class ExpiracaoCronController {
  private readonly logger = new Logger(ExpiracaoCronController.name);

  constructor(
    private readonly certificados: CertificadosService,
    private readonly config: ConfigService,
  ) {}

  /**
   * `GET` porque o Vercel Cron só emite GET, e ele manda
   * `Authorization: Bearer <CRON_SECRET>` sozinho quando a variável existe.
   *
   * Fora do Swagger: publicar um mapa de "rota que dispensa sessão" só ajuda
   * quem for procurar por ela.
   */
  @Public()
  @Get('expirar-vencidos')
  // Estreito contra tentativa de adivinhar o segredo. A rotina legítima roda
  // uma vez por dia, então 4 por minuto é folga de sobra.
  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  @ApiExcludeEndpoint()
  async expirarVencidos(@Headers('authorization') autorizacao?: string) {
    this.conferirSegredo(autorizacao);

    const resultado = await this.certificados.expirarVencidos();

    // Sempre em nível `log`, inclusive sem nada a fazer: é assim que se
    // distingue "a rotina rodou e não achou nada" de "a rotina não rodou".
    this.logger.log(`Expiração agendada: ${resultado.mensagem}`);

    return resultado;
  }

  /**
   * Compara em tempo constante. `===` sobre segredo vaza o tamanho do prefixo
   * correto pelo tempo de resposta, e aqui quem chama pode medir à vontade.
   */
  private conferirSegredo(autorizacao?: string): void {
    const esperado = this.config.get<string>('CRON_SECRET', '');

    if (!esperado) {
      // Sem segredo configurado a rota fica fechada, nunca aberta. Um deploy
      // sem a variável deve falhar de forma visível no log do agendador, e não
      // executar rotina de negócio para quem quer que peça.
      this.logger.warn(
        'CRON_SECRET não configurado: gatilho de expiração recusado. ' +
          'Defina a variável no ambiente para o Vercel Cron funcionar.',
      );
      throw new UnauthorizedException('Não autorizado.');
    }

    const recebido = autorizacao?.replace(/^Bearer\s+/i, '') ?? '';
    const a = Buffer.from(recebido);
    const b = Buffer.from(esperado);

    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Não autorizado.');
    }
  }
}
