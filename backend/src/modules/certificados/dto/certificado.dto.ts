import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusCertificado } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { PaginacaoDto } from '../../../common/dto/paginacao.dto';

export class EmitirCertificadoDto {
  @ApiProperty({
    example: 'Cinturão de segurança tipo paraquedista, modelos CS-100 e CS-120.',
    description: 'O que exatamente está certificado (modelo, variante, aplicação)',
  })
  @IsString()
  @MinLength(10, { message: 'Descreva o escopo com pelo menos 10 caracteres.' })
  @MaxLength(2000)
  escopo!: string;

  @ApiPropertyOptional({
    description:
      'Sobrescreve a validade padrão da categoria. Informe a data final da vigência.',
    example: '2028-08-12',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Data de validade inválida.' })
  dataValidade?: string;
}

/**
 * Suspensão, cancelamento ou reativação.
 *
 * `VENCIDO` não entra: é consequência do tempo, aplicada pela rotina de
 * expiração, não uma decisão manual.
 */
export class AlterarStatusCertificadoDto {
  @ApiProperty({
    enum: [
      StatusCertificado.EMITIDO,
      StatusCertificado.SUSPENSO,
      StatusCertificado.CANCELADO,
    ],
  })
  @IsEnum(StatusCertificado)
  status!: StatusCertificado;

  @ApiPropertyOptional({
    description: 'Obrigatório ao suspender ou cancelar',
  })
  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'Justifique com pelo menos 10 caracteres.' })
  @MaxLength(2000)
  motivoStatus?: string;
}

/**
 * Janela de vencimento da tela de certificados em risco.
 *
 * `dias` tem teto porque a consulta ordena a carteira inteira por validade:
 * sem limite, "em risco" com 20 anos de janela viraria a listagem completa por
 * outro caminho, sem o filtro de status que a listagem comum oferece.
 */
export class ListarEmRiscoDto extends PaginacaoDto {
  @ApiPropertyOptional({
    description: 'Quantos dias à frente considerar. Vencidos entram sempre.',
    default: 90,
    minimum: 1,
    maximum: 365,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  dias: number = 90;

  @ApiPropertyOptional({ description: 'Filtra por cliente (ignorado para CLIENTE)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clienteId?: number;
}

export class ListarCertificadosDto extends PaginacaoDto {
  @ApiPropertyOptional({ enum: StatusCertificado })
  @IsOptional()
  @IsEnum(StatusCertificado)
  status?: StatusCertificado;

  @ApiPropertyOptional({ description: 'Filtra por produto' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  produtoId?: number;

  @ApiPropertyOptional({ description: 'Filtra por cliente (ignorado para CLIENTE)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clienteId?: number;
}
