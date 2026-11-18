import { Module } from '@nestjs/common';

import { NotificacoesController } from './notificacoes.controller';
import { NotificacoesService } from './notificacoes.service';

/**
 * Caixa de avisos da equipe.
 *
 * Exporta o service porque quem GRAVA o aviso é o módulo onde o evento
 * acontece — `certificacoes`, hoje —, dentro da transação dele. O módulo não
 * observa nada: não há emissor de eventos nem fila, e acrescentar um deles
 * agora seria infraestrutura sem segunda fonte para justificar.
 *
 * **Não é `@Global()`**, ao contrário do `MailModule`: só um módulo grava
 * aviso, e tornar global esconderia quem depende de quem.
 */
@Module({
  controllers: [NotificacoesController],
  providers: [NotificacoesService],
  exports: [NotificacoesService],
})
export class NotificacoesModule {}
