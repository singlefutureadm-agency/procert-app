import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { NotificacoesService } from './notificacoes.service';

@Global()
@Module({
  providers: [MailService, NotificacoesService],
  exports: [MailService, NotificacoesService],
})
export class MailModule {}
