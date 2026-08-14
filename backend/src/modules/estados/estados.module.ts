import { Controller, Get, Module } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Estados')
@Controller('estados')
class EstadosController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Lista as unidades federativas' })
  listar() {
    return this.prisma.estado.findMany({ orderBy: { sigla: 'asc' } });
  }
}

@Module({ controllers: [EstadosController] })
export class EstadosModule {}
