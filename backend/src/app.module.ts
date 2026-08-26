import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

import { AparenciaModule } from './modules/aparencia/aparencia.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriasProdutoModule } from './modules/categorias-produto/categorias-produto.module';
import { CertificacoesModule } from './modules/certificacoes/certificacoes.module';
import { CertificadosModule } from './modules/certificados/certificados.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { ContatoModule } from './modules/contato/contato.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { RelatoriosModule } from './modules/relatorios/relatorios.module';
import { EstadosModule } from './modules/estados/estados.module';
import { FuncionariosModule } from './modules/funcionarios/funcionarios.module';
import { HealthModule } from './modules/health/health.module';
import { ModelosTrilhaModule } from './modules/modelos-trilha/modelos-trilha.module';
import { NaoConformidadesModule } from './modules/nao-conformidades/nao-conformidades.module';
import { MailModule } from './modules/mail/mail.module';
import { ProdutosModule } from './modules/produtos/produtos.module';
import { UploadsModule } from './modules/uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    // Rotinas agendadas em processo. Hoje só a expiração de certificados
    // (modules/certificados/expiracao.cron.ts) — ver DOCUMENTACAO.md §9.
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    MailModule,
    UploadsModule,
    AuthModule,
    ClientesModule,
    FuncionariosModule,
    CategoriasProdutoModule,
    ModelosTrilhaModule,
    ProdutosModule,
    NaoConformidadesModule,
    CertificacoesModule,
    CertificadosModule,
    EstadosModule,
    DashboardModule,
    RelatoriosModule,
    ContatoModule,
    AparenciaModule,
  ],
  providers: [
    // Ordem importa: autentica, depois autoriza por papel, depois limita taxa.
    // No legado NÃO havia guarda alguma — endpoints de exclusão eram públicos.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
