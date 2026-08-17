import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, TemaPadrao } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { APARENCIA_PADRAO, TokensTema } from './aparencia.defaults';
import { SalvarAparenciaDto } from './dto/aparencia.dto';

export interface AparenciaResolvida {
  temaClaro: TokensTema;
  temaEscuro: TokensTema;
  fonte: string;
  temaPadrao: TemaPadrao;
  permitirAlternancia: boolean;
  logoUrl: string | null;
  papelParedeUrl: string | null;
  papelParedeOpacidade: number;
  papelParedeAjuste: string;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
  /** false = nunca foi salva; o painel está rodando no preset de fábrica. */
  personalizada: boolean;
}

/** A configuração é singleton: uma linha, id fixo. */
const ID_UNICO = 1;

@Injectable()
export class AparenciaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  /**
   * Nunca lança por ausência de configuração: instalação nova responde os
   * defaults do `global.css`. É o que permite o painel se pintar antes de
   * qualquer admin abrir a tela de aparência.
   */
  async buscar(): Promise<AparenciaResolvida> {
    const config = await this.prisma.configuracaoAparencia.findUnique({
      where: { id: ID_UNICO },
      include: { atualizadoPor: { select: { nome: true } } },
    });

    if (!config) {
      return {
        ...APARENCIA_PADRAO,
        atualizadoEm: null,
        atualizadoPor: null,
        personalizada: false,
      };
    }

    return {
      temaClaro: config.temaClaro as unknown as TokensTema,
      temaEscuro: config.temaEscuro as unknown as TokensTema,
      fonte: config.fonte,
      temaPadrao: config.temaPadrao,
      permitirAlternancia: config.permitirAlternancia,
      logoUrl: config.logoUrl,
      papelParedeUrl: config.papelParedeUrl,
      papelParedeOpacidade: config.papelParedeOpacidade,
      papelParedeAjuste: config.papelParedeAjuste,
      atualizadoEm: config.atualizadoEm.toISOString(),
      atualizadoPor: config.atualizadoPor?.nome ?? null,
      personalizada: true,
    };
  }

  async salvar(dto: SalvarAparenciaDto, funcionarioId: number) {
    const { atualizadoEmVisto, ...dados } = dto;

    await this.garantirQueNinguemSalvouAntes(atualizadoEmVisto);

    // `logoUrl` e `papelParedeUrl` não vêm daqui de propósito: só os endpoints
    // de upload os definem. Aceitá-los no corpo deixaria o admin apontar a
    // marca do painel para uma URL externa arbitrária.
    const conteudo = {
      temaClaro: dados.temaClaro as unknown as Prisma.InputJsonValue,
      temaEscuro: dados.temaEscuro as unknown as Prisma.InputJsonValue,
      fonte: dados.fonte,
      temaPadrao: dados.temaPadrao,
      permitirAlternancia: dados.permitirAlternancia,
      papelParedeOpacidade: dados.papelParedeOpacidade,
      papelParedeAjuste: dados.papelParedeAjuste,
      atualizadoPorId: funcionarioId,
    };

    await this.prisma.configuracaoAparencia.upsert({
      where: { id: ID_UNICO },
      create: { id: ID_UNICO, ...conteudo },
      update: conteudo,
    });

    return this.buscar();
  }

  /* ------------------------------ Imagens -------------------------------- */

  async salvarLogo(arquivo: Express.Multer.File, funcionarioId: number) {
    return this.trocarImagem('logoUrl', arquivo, funcionarioId);
  }

  async salvarPapelParede(arquivo: Express.Multer.File, funcionarioId: number) {
    return this.trocarImagem('papelParedeUrl', arquivo, funcionarioId);
  }

  async removerLogo(funcionarioId: number) {
    return this.trocarImagem('logoUrl', null, funcionarioId);
  }

  async removerPapelParede(funcionarioId: number) {
    return this.trocarImagem('papelParedeUrl', null, funcionarioId);
  }

  /**
   * Upload ou remoção das duas imagens. Grava a nova, aponta a configuração
   * para ela e só então apaga a anterior — a ordem importa: apagar primeiro
   * deixaria o painel sem logo se a escrita falhasse no meio.
   */
  private async trocarImagem(
    campo: 'logoUrl' | 'papelParedeUrl',
    arquivo: Express.Multer.File | null,
    funcionarioId: number,
  ): Promise<AparenciaResolvida> {
    const atual = await this.prisma.configuracaoAparencia.findUnique({
      where: { id: ID_UNICO },
      select: { logoUrl: true, papelParedeUrl: true },
    });
    const anterior = atual?.[campo] ?? null;

    const nova = arquivo
      ? await this.uploads.salvarImagem(arquivo, 'aparencia')
      : null;

    const conteudo = { [campo]: nova, atualizadoPorId: funcionarioId };

    await this.prisma.configuracaoAparencia.upsert({
      where: { id: ID_UNICO },
      create: {
        id: ID_UNICO,
        temaClaro: APARENCIA_PADRAO.temaClaro as unknown as Prisma.InputJsonValue,
        temaEscuro: APARENCIA_PADRAO.temaEscuro as unknown as Prisma.InputJsonValue,
        fonte: APARENCIA_PADRAO.fonte,
        temaPadrao: APARENCIA_PADRAO.temaPadrao,
        permitirAlternancia: APARENCIA_PADRAO.permitirAlternancia,
        papelParedeOpacidade: APARENCIA_PADRAO.papelParedeOpacidade,
        papelParedeAjuste: APARENCIA_PADRAO.papelParedeAjuste,
        ...conteudo,
      },
      update: conteudo,
    });

    await this.uploads.remover(anterior);
    return this.buscar();
  }

  /**
   * Apaga a linha em vez de gravar os defaults: assim existe um único lugar
   * definindo o preset de fábrica (`aparencia.defaults.ts`), e mexer nele passa
   * a valer também para quem já restaurou antes.
   */
  async restaurarPadrao(): Promise<AparenciaResolvida> {
    const atual = await this.prisma.configuracaoAparencia.findUnique({
      where: { id: ID_UNICO },
      select: { logoUrl: true, papelParedeUrl: true },
    });

    await this.prisma.configuracaoAparencia.deleteMany({ where: { id: ID_UNICO } });

    // Apagar a linha sem apagar os arquivos deixaria logo e papel de parede
    // órfãos em disco, sem nada mais apontando para eles.
    await this.uploads.remover(atual?.logoUrl);
    await this.uploads.remover(atual?.papelParedeUrl);

    return this.buscar();
  }

  /**
   * Concorrência otimista. A alternativa era o último a salvar sobrescrever o
   * outro em silêncio — barato de evitar, e caro de descobrir depois.
   */
  private async garantirQueNinguemSalvouAntes(visto?: string): Promise<void> {
    if (!visto) return;

    const atual = await this.prisma.configuracaoAparencia.findUnique({
      where: { id: ID_UNICO },
      select: { atualizadoEm: true },
    });

    if (atual && atual.atualizadoEm.toISOString() !== visto) {
      throw new ConflictException(
        'Outro administrador alterou a aparência depois que você abriu a tela. ' +
          'Recarregue a página para ver a configuração atual antes de salvar.',
      );
    }
  }
}
