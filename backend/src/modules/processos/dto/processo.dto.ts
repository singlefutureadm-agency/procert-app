import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { MotivoProcesso, StatusRegistro } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { PaginacaoDto } from '../../../common/dto/paginacao.dto';

export class CriarProcessoDto {
  @ApiProperty({ description: 'Cliente proprietário do processo' })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  clienteId!: number;

  @ApiProperty({
    description:
      'Categoria do processo. Define a trilha de certificação: o processo é ' +
      'vinculado à versão vigente do modelo dessa categoria.',
  })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  categoriaId!: number;

  @ApiProperty({ example: 'Cinturão de segurança tipo paraquedista' })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  nome!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  descricao?: string;

  @ApiPropertyOptional({ example: 2500.0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  preco?: number;

  @ApiPropertyOptional({
    enum: MotivoProcesso,
    default: MotivoProcesso.INICIAL,
    description:
      'Por que o processo foi aberto. Vinha no nome do card do quadro ' +
      '(INICIAL / RENOVAÇÃO / RECERTIFICAÇÃO / MANUTENÇÃO / TRANSFERÊNCIA).',
  })
  @IsOptional()
  @IsEnum(MotivoProcesso)
  motivoProcesso?: MotivoProcesso;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Concluir todas as microetapas de uma etapa aprova a etapa sozinha. ' +
      'OMITIDO ou `null` = herda o padrão da versão de trilha do processo; ' +
      '`true`/`false` sobrepõem só para este processo.',
  })
  @IsOptional()
  @IsBoolean()
  aprovacaoAutomatica?: boolean | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 3,
    description:
      'Funcionário DONO do processo. É quem recebe aviso sobre ele — e não ' +
      'uma área: `papelResponsavel` da etapa continua sendo o PapelFuncional. ' +
      'Não restringe acesso: a equipe inteira segue vendo e avaliando o ' +
      'processo. Envie `null` para deixar sem responsável.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  responsavelId?: number | null;
}

/**
 * `categoriaId` fica de fora: trocar a categoria depois da submissão mudaria a
 * trilha de um processo já em avaliação. Isso é reabertura de processo, não
 * edição de cadastro.
 */
export class AtualizarProcessoDto extends PartialType(
  OmitType(CriarProcessoDto, ['categoriaId'] as const),
) {}

export class ListarProcessosDto extends PaginacaoDto {
  @ApiPropertyOptional({ enum: StatusRegistro, default: StatusRegistro.ATIVO })
  @IsOptional()
  @IsEnum(StatusRegistro)
  status?: StatusRegistro;

  @ApiPropertyOptional({ description: 'Filtra por cliente' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clienteId?: number;

  @ApiPropertyOptional({ description: 'Filtra por categoria' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoriaId?: number;

  /**
   * Filtra pelo dono do processo. `0` lista os SEM responsável — mesma
   * convenção de `ListarClientesDto.responsavelId`, e o motivo é o mesmo:
   * "sem dono" é o recorte que precisa ser achável, não um efeito colateral
   * de não filtrar nada.
   */
  @ApiPropertyOptional({
    description:
      'Id do funcionário responsável. Use 0 para listar os processos sem ' +
      'responsável.',
    example: 3,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  responsavelId?: number;
}
