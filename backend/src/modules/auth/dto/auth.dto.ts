import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import { SENHA_MENSAGEM, SENHA_REGEX } from '../../../common/utils/senha.util';

export class LoginDto {
  @ApiProperty({ example: 'admin@procertocp.com.br' })
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(150)
  email!: string;

  @ApiProperty({ example: 'Procert@2026' })
  @IsString()
  @IsNotEmpty({ message: 'Informe a senha.' })
  @MaxLength(128)
  senha!: string;
}

export class EsqueciSenhaDto {
  @ApiProperty({ example: 'usuario@empresa.com.br' })
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(150)
  email!: string;
}

export class RedefinirSenhaDto {
  @ApiProperty({ description: 'Token recebido por e-mail' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ example: 'NovaSenha2026' })
  @IsString()
  @Matches(SENHA_REGEX, { message: SENHA_MENSAGEM })
  novaSenha!: string;
}

export class AlterarSenhaDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Informe a senha atual.' })
  senhaAtual!: string;

  @ApiProperty()
  @IsString()
  @Matches(SENHA_REGEX, { message: SENHA_MENSAGEM })
  novaSenha!: string;
}

/** Payload assinado no JWT. */
export interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
  nome: string;
}

export interface RespostaLogin {
  accessToken: string;
  usuario: {
    id: number;
    nome: string;
    email: string;
    role: Role;
    fotoUrl: string | null;
  };
}
