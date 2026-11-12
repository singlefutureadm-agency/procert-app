import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginacaoDto, paginar } from '../../common/dto/paginacao.dto';
import { LIMITES } from '../../common/limites';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificacoesService } from '../mail/notificacoes.service';

class CriarMensagemContatoDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  nome!: string;

  @ApiProperty()
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(150)
  email!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefone?: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  assunto!: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  mensagem!: string;
}

/**
 * Formulário público de contato.
 * No legado o model Contato existia mas nenhum controller o usava — o form
 * do site apontava para `forms/contact.php`, arquivo que nem estava no repo.
 */
@ApiTags('Contato')
@Controller('contato')
class ContatoController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  @Public()
  @Post()
  @Throttle(LIMITES.contato)
  @ApiOperation({ summary: 'Recebe uma mensagem do site institucional' })
  async criar(@Body() dto: CriarMensagemContatoDto) {
    const registro = await this.prisma.mensagemContato.create({ data: dto });

    await this.notificacoes.contatoRecebido(
      process.env.MAIL_USER ?? 'procertocp@gmail.com',
      dto,
    );

    return {
      id: registro.id,
      mensagem: 'Mensagem enviada com sucesso. Em breve entraremos em contato.',
    };
  }

  @Get()
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({ summary: 'Lista as mensagens recebidas' })
  async listar(@Query() filtros: PaginacaoDto) {
    const [dados, total] = await this.prisma.$transaction([
      this.prisma.mensagemContato.findMany({
        orderBy: { criadoEm: 'desc' },
        skip: filtros.skip,
        take: filtros.limite,
      }),
      this.prisma.mensagemContato.count(),
    ]);

    return paginar(dados, total, filtros);
  }

  @Patch(':id/lida')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.FUNCIONARIO)
  @ApiOperation({ summary: 'Marca a mensagem como lida' })
  marcarLida(@Param('id', ParseIntPipe) id: number) {
    return this.prisma.mensagemContato.update({
      where: { id },
      data: { lida: true },
    });
  }
}

@Module({ controllers: [ContatoController] })
export class ContatoModule {}
