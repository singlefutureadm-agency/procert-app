import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role, TemaPadrao } from '@prisma/client';

import {
  CurrentUser,
  UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AparenciaService } from './aparencia.service';
import { SalvarAparenciaDto } from './dto/aparencia.dto';

@ApiTags('Aparência do painel')
@Controller('aparencia')
export class AparenciaController {
  constructor(private readonly aparenciaService: AparenciaService) {}

  /**
   * Público de propósito. O corpo é só cor, medida, id de fonte e URLs de
   * imagem — nenhuma informação de negócio. Precisa ser lido sem token porque
   * a logo aparece no site institucional e na tela de login, e porque um painel
   * que só se pinta depois de autenticar pisca o tema errado no caminho.
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Configuração de aparência vigente (ou o preset padrão)' })
  buscar() {
    return this.aparenciaService.buscar();
  }

  @Put()
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Substitui a configuração de aparência' })
  salvar(
    @Body() dto: SalvarAparenciaDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.aparenciaService.salvar(dto, usuario.id);
  }

  @Post('restaurar-padrao')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Volta ao preset "Padrão ProCert" e apaga as imagens' })
  restaurarPadrao() {
    return this.aparenciaService.restaurarPadrao();
  }

  /*
   * Duas logos, duas rotas. A alternativa era `/logo/:tema` com o tema vindo da
   * URL, o que obrigaria a validar a string antes de ela virar nome de coluna;
   * aqui o handler já escolhe a constante do enum e não há o que validar.
   */

  @Post('logo/tema-claro')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('imagem'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Envia ou substitui a logo usada no tema claro' })
  enviarLogoTemaClaro(
    @UploadedFile() arquivo: Express.Multer.File,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.aparenciaService.salvarLogo(TemaPadrao.CLARO, arquivo, usuario.id);
  }

  @Delete('logo/tema-claro')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a logo do tema claro' })
  removerLogoTemaClaro(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.aparenciaService.removerLogo(TemaPadrao.CLARO, usuario.id);
  }

  @Post('logo/tema-escuro')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('imagem'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Envia ou substitui a logo usada no tema escuro' })
  enviarLogoTemaEscuro(
    @UploadedFile() arquivo: Express.Multer.File,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.aparenciaService.salvarLogo(TemaPadrao.ESCURO, arquivo, usuario.id);
  }

  @Delete('logo/tema-escuro')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a logo do tema escuro' })
  removerLogoTemaEscuro(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.aparenciaService.removerLogo(TemaPadrao.ESCURO, usuario.id);
  }

  @Post('papel-parede')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('imagem'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Envia ou substitui o papel de parede do painel' })
  enviarPapelParede(
    @UploadedFile() arquivo: Express.Multer.File,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.aparenciaService.salvarPapelParede(arquivo, usuario.id);
  }

  @Delete('papel-parede')
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove o papel de parede' })
  removerPapelParede(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.aparenciaService.removerPapelParede(usuario.id);
  }
}
