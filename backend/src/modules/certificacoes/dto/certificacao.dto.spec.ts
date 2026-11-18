import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SituacaoDocumento } from '@prisma/client';

import { AvaliarDocumentoDto } from './certificacao.dto';

/**
 * A exigência de parecer é CONDICIONAL — só na recusa —, e condicional é onde
 * `class-validator` engana.
 *
 * Um `@IsOptional()` no `parecer` deixaria a recusa sem motivo passar pela
 * borda. O banco a recusaria (`ck_documento_avaliacao`), mas aí o usuário
 * recebe 500 com texto de constraint em vez da frase que diz o que fazer — e,
 * pior, o caminho "recusei e não escrevi nada" chega até o banco em vez de
 * parar no DTO.
 *
 * Na direção oposta, um `@IsString()` sem o `ValidateIf` exigiria parecer para
 * ACEITAR, o que não faz sentido nenhum e só seria descoberto na tela.
 */
describe('AvaliarDocumentoDto', () => {
  const peloPipe = (corpo: object) => {
    const dto = plainToInstance(AvaliarDocumentoDto, corpo);
    return validateSync(dto as object, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
  };

  it('RECUSADO sem parecer é recusado na borda', () => {
    const erros = peloPipe({ situacao: SituacaoDocumento.RECUSADO });

    expect(erros).toHaveLength(1);
    expect(erros[0].property).toBe('parecer');
  });

  it('RECUSADO com parecer passa', () => {
    expect(
      peloPipe({
        situacao: SituacaoDocumento.RECUSADO,
        parecer: 'Certificado fora da validade.',
      }),
    ).toHaveLength(0);
  });

  it('ACEITO NÃO exige parecer', () => {
    expect(peloPipe({ situacao: SituacaoDocumento.ACEITO })).toHaveLength(0);
  });

  it('ACEITO aceita parecer, se alguém quiser comentar', () => {
    // O service descarta na aceitação, mas a borda não precisa brigar: recusar
    // aqui daria 400 num payload que não tem nada de errado.
    expect(
      peloPipe({ situacao: SituacaoDocumento.ACEITO, parecer: 'Conforme.' }),
    ).toHaveLength(0);
  });

  it('PENDENTE não é um destino de avaliação', () => {
    // É o estado de CHEGADA, escrito pelo envio. Voltar um documento para
    // "pendente" não tem significado operacional: a equipe já o olhou.
    const erros = peloPipe({ situacao: SituacaoDocumento.PENDENTE });

    expect(erros).toHaveLength(1);
    expect(erros[0].property).toBe('situacao');
  });

  it('parecer de uma linha só não serve como motivo', () => {
    expect(
      peloPipe({ situacao: SituacaoDocumento.RECUSADO, parecer: 'não' }),
    ).toHaveLength(1);
  });
});
