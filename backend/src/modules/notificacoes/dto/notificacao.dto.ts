import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

import { PaginacaoDto } from '../../../common/dto/paginacao.dto';

/**
 * Filtros da caixa de avisos.
 *
 * **Não existe filtro de destinatário**, e a ausência é a regra: o id sai do
 * token, sempre. Um `destinatarioId` opcional aqui seria a porta para ler a
 * caixa de outra pessoa — exatamente o `clienteId` vindo de query param que a
 * migração corrigiu do legado.
 */
export class ListarNotificacoesDto extends PaginacaoDto {
  @ApiPropertyOptional({
    description:
      'Traz apenas as não lidas. É o que o painel suspenso do sino mostra.',
  })
  @IsOptional()
  /*
   * Lê o valor CRU de `obj[key]`, e não o `value` já transformado.
   *
   * O `ValidationPipe` global roda com `enableImplicitConversion: true`, e a
   * conversão implícita acontece ANTES deste `@Transform`: ela recebe a string
   * `"false"` da query e entrega `true` — porque, para ela, string não vazia é
   * verdadeira. Um transform escrito sobre `value` receberia esse `true` já
   * cozido e `?apenasNaoLidas=false` faria o OPOSTO do pedido, sem erro nenhum.
   *
   * `obj` é o objeto de origem, antes de qualquer conversão: é a única leitura
   * que distingue "false" de "true". Travado em `notificacao.dto.spec.ts`.
   */
  @Transform(({ obj, key }) => {
    const bruto = (obj as Record<string, unknown>)[key];
    return bruto === true || bruto === 'true' || bruto === '1';
  })
  @IsBoolean()
  apenasNaoLidas?: boolean;
}
