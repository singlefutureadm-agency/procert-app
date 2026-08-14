import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoPessoa } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Campos cadastrais compartilhados por Cliente e Funcionário.
 * No legado, esses ~15 campos eram repetidos e sanitizados manualmente
 * em cada controller com filter_input().
 */
export class PessoaBaseDto {
  @ApiProperty({ example: 'Indústria Alfa Ltda' })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  nome!: string;

  @ApiProperty({ example: 'contato@alfa.com.br' })
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(150)
  email!: string;

  @ApiPropertyOptional({ enum: TipoPessoa, default: TipoPessoa.JURIDICA })
  @IsOptional()
  @IsEnum(TipoPessoa)
  tipoPessoa?: TipoPessoa;

  @ApiPropertyOptional({ example: '123.456.789-00' })
  @IsOptional()
  @IsString()
  @MaxLength(14)
  cpf?: string;

  @ApiPropertyOptional({ example: '12.345.678/0001-90' })
  @IsOptional()
  @IsString()
  @MaxLength(18)
  cnpj?: string;

  @ApiPropertyOptional({ example: '1990-05-20' })
  @IsOptional()
  @IsDateString({}, { message: 'Data de nascimento inválida.' })
  dataNascimento?: string;

  @ApiPropertyOptional({ example: '(11) 91234-5678' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefone?: string;

  @ApiPropertyOptional({ example: '05074-080' })
  @IsOptional()
  @Matches(/^\d{5}-?\d{3}$/, { message: 'CEP inválido.' })
  cep?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  endereco?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bairro?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  cidade?: string;

  @ApiPropertyOptional({ description: 'ID da UF' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  estadoId?: number;
}
