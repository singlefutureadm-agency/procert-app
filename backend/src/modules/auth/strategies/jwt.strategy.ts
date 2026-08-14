import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Role, StatusRegistro } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../../prisma/prisma.service';
import { UsuarioAutenticado } from '../../../common/decorators/current-user.decorator';
import { JwtPayload } from '../dto/auth.dto';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Revalida o usuário no banco a cada requisição: um cadastro desativado
   * perde o acesso imediatamente, mesmo com o token ainda válido.
   */
  async validate(payload: JwtPayload): Promise<UsuarioAutenticado> {
    const registro =
      payload.role === Role.CLIENTE
        ? await this.prisma.cliente.findUnique({ where: { id: payload.sub } })
        : await this.prisma.funcionario.findUnique({
            where: { id: payload.sub },
          });

    if (!registro || registro.status !== StatusRegistro.ATIVO) {
      throw new UnauthorizedException('Sessão inválida ou usuário inativo.');
    }

    return {
      id: registro.id,
      nome: registro.nome,
      email: registro.email,
      role: payload.role,
    };
  }
}
