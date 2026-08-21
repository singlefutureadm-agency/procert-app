import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Health check.
 *
 * Existe por causa do deploy: depois de publicar, "a API subiu" e "a API
 * enxerga o banco" são duas perguntas diferentes, e a segunda é a que costuma
 * falhar (variável de ambiente errada, firewall do banco, senha não escapada na
 * URL). Sem isto, descobrir qual das duas quebrou exige abrir o painel e tentar
 * logar — que falha do mesmo jeito nos dois casos.
 *
 * O `SELECT 1` é de propósito a consulta mais barata possível: o objetivo é
 * provar que o pool do Prisma tem conexão viva, não medir o banco. Load
 * balancer e monitor batem aqui de minuto em minuto, então a rota também fica
 * fora do throttler — 120 req/min é folgado para um humano e apertado para um
 * agregador de checagens.
 */
@ApiTags('Health')
@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @SkipThrottle()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Estado da API e da conexão com o banco' })
  @ApiResponse({ status: 200, description: 'API e banco respondendo.' })
  @ApiResponse({ status: 503, description: 'Banco inacessível.' })
  async verificar() {
    const inicio = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      /*
       * A mensagem do driver traz host, porta e às vezes usuário — numa rota
       * pública isso é entregar metade da string de conexão a quem perguntar.
       * Quem precisa do detalhe tem o log do processo.
       */
      throw new ServiceUnavailableException(
        'Banco de dados inacessível no momento.',
      );
    }

    return {
      status: 'ok',
      banco: 'ok',
      latenciaBancoMs: Date.now() - inicio,
      horario: new Date().toISOString(),
    };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
