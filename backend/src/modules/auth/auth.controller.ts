import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { Public } from '../../common/decorators/public.decorator';
import { LIMITES } from '../../common/limites';
import {
  CurrentUser,
  UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import {
  AlterarSenhaDto,
  EsqueciSenhaDto,
  LoginDto,
  RedefinirSenhaDto,
} from './dto/auth.dto';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Limite estreito contra força bruta — inexistente no legado.
  @Throttle(LIMITES.login)
  @ApiOperation({ summary: 'Autentica cliente ou membro da equipe' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perfil completo do usuário autenticado' })
  perfil(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.authService.perfil(usuario);
  }

  @Public()
  @Post('esqueci-senha')
  @HttpCode(HttpStatus.OK)
  @Throttle(LIMITES.esqueciSenha)
  @ApiOperation({ summary: 'Envia o link de redefinição por e-mail' })
  esqueciSenha(@Body() dto: EsqueciSenhaDto) {
    return this.authService.esqueciSenha(dto);
  }

  @Public()
  @Post('redefinir-senha')
  @HttpCode(HttpStatus.OK)
  @Throttle(LIMITES.redefinirSenha)
  @ApiOperation({ summary: 'Define uma nova senha a partir do token' })
  redefinirSenha(@Body() dto: RedefinirSenhaDto) {
    return this.authService.redefinirSenha(dto);
  }

  @Patch('alterar-senha')
  // Com um token roubado, a senha atual é o que impede tomar a conta de vez:
  // 120/min do padrão daria força bruta nela.
  @Throttle(LIMITES.alterarSenha)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Troca a própria senha' })
  alterarSenha(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: AlterarSenhaDto,
  ) {
    return this.authService.alterarSenha(usuario, dto);
  }
}
