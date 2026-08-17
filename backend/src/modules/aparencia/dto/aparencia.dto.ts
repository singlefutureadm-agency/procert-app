import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TemaPadrao } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { AJUSTES_PAPEL_PAREDE, FONTES_PERMITIDAS } from '../aparencia.defaults';

/**
 * Só hex (3, 6 ou 8 dígitos) e rgb()/rgba() com componentes numéricos.
 *
 * Estes valores vão para `style.setProperty()` no documento, então o que passa
 * daqui é CSS executado no navegador de todo usuário do painel. Deliberadamente
 * fora: `var()`, `url()`, `calc()`, `image-set()`, ponto e vírgula e chaves —
 * tudo que permitiria fechar a declaração e abrir outra.
 */
const REGEX_COR =
  /^(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d{1,3})\s*)?\))$/;

const Cor = () =>
  Matches(REGEX_COR, {
    message: '$property deve ser uma cor hex (#rrggbb) ou rgb()/rgba() válida',
  });

/**
 * Allowlist fechada dos tokens de um modo. Com `forbidNonWhitelisted` global,
 * qualquer chave a mais no payload derruba a requisição com 400 — que é
 * exatamente o que impede transformar o campo `Json` em superfície de ataque.
 */
export class TokensTemaDto {
  @ApiProperty({ example: '#0d6efd' }) @Cor() corPrimaria!: string;
  @ApiProperty({ example: '#0a58ca' }) @Cor() corPrimariaEscura!: string;
  @ApiProperty({ example: '#16a34a' }) @Cor() corSucesso!: string;
  @ApiProperty({ example: '#f59e0b' }) @Cor() corAlerta!: string;
  @ApiProperty({ example: '#dc2626' }) @Cor() corErro!: string;
  @ApiProperty({ example: '#0ea5e9' }) @Cor() corInfo!: string;

  @ApiProperty({ example: '#0b1220' }) @Cor() fundo!: string;
  @ApiProperty({ example: '#111a2e' }) @Cor() fundoDegrade!: string;
  @ApiProperty({ example: 'rgba(13, 110, 253, 0.35)' }) @Cor() fundoBrilho1!: string;
  @ApiProperty({ example: 'rgba(14, 165, 233, 0.25)' }) @Cor() fundoBrilho2!: string;

  @ApiProperty({ example: '#f8fafc' }) @Cor() texto!: string;
  @ApiProperty({ example: 'rgba(248, 250, 252, 0.72)' }) @Cor() textoSuave!: string;
  @ApiProperty({ example: 'rgba(248, 250, 252, 0.5)' }) @Cor() textoFraco!: string;
  @ApiProperty({ example: '#ffffff' }) @Cor() textoSobrePrimaria!: string;

  @ApiProperty({ example: 'rgba(255, 255, 255, 0.07)' }) @Cor() vidroFundo!: string;
  @ApiProperty({ example: 'rgba(255, 255, 255, 0.12)' }) @Cor() vidroFundoForte!: string;
  @ApiProperty({ example: 'rgba(255, 255, 255, 0.18)' }) @Cor() vidroBorda!: string;
  @ApiProperty({ example: 'rgba(2, 6, 23, 0.45)' }) @Cor() sombraCor!: string;
  @ApiProperty({ example: 'rgba(2, 6, 23, 0.72)' }) @Cor() overlayModal!: string;

  @ApiProperty({ example: 14, description: 'Intensidade do blur do vidro, em px' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(40)
  vidroBlur!: number;

  @ApiProperty({ example: 16, description: 'Raio de borda padrão, em px' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(32)
  raio!: number;

  @ApiProperty({ example: 10, description: 'Raio de borda dos elementos menores, em px' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24)
  raioSm!: number;
}

export class SalvarAparenciaDto {
  @ApiProperty({ type: TokensTemaDto })
  @ValidateNested()
  @Type(() => TokensTemaDto)
  temaClaro!: TokensTemaDto;

  @ApiProperty({ type: TokensTemaDto })
  @ValidateNested()
  @Type(() => TokensTemaDto)
  temaEscuro!: TokensTemaDto;

  @ApiProperty({
    enum: FONTES_PERMITIDAS,
    description: 'Id do catálogo de fontes — campo livre não é aceito',
  })
  @IsIn(FONTES_PERMITIDAS as unknown as string[])
  fonte!: string;

  @ApiProperty({
    minimum: 0,
    maximum: 100,
    description: 'Opacidade do papel de parede. 0 desliga sem apagar o arquivo.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  papelParedeOpacidade!: number;

  @ApiProperty({ enum: AJUSTES_PAPEL_PAREDE })
  @IsIn(AJUSTES_PAPEL_PAREDE as unknown as string[])
  papelParedeAjuste!: string;

  @ApiProperty({ enum: TemaPadrao })
  @IsEnum(TemaPadrao)
  temaPadrao!: TemaPadrao;

  @ApiProperty({
    description: 'Permite ao usuário alternar claro/escuro localmente',
  })
  @IsBoolean()
  permitirAlternancia!: boolean;

  @ApiPropertyOptional({
    description:
      'O `atualizadoEm` que o cliente leu ao abrir a tela. Se o servidor tiver ' +
      'um mais recente, alguém salvou no meio do caminho e a resposta é 409.',
  })
  @IsOptional()
  @IsDateString()
  atualizadoEmVisto?: string;
}
