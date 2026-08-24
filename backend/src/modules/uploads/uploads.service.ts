import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

import {
  type Armazenamento,
  ARMAZENAMENTO,
  mimeDaExtensao,
} from './uploads.armazenamento';
import { arquivoDeUpload, PREFIXO_UPLOADS } from './uploads.constantes';
import type { PastaUpload } from './uploads.constantes';

/** Reexportado para não quebrar quem já importava o tipo daqui. */
export type { PastaUpload };

const MIMES_PERMITIDOS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/**
 * Evidências de etapa: além de imagens, os formatos em que laudos e relatórios
 * realmente circulam. Continua sendo um allowlist — nada de executável.
 */
const MIMES_DOCUMENTO: Record<string, string> = {
  ...MIMES_PERMITIDOS,
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

/**
 * Armazenamento de imagens e documentos enviados pelos usuários.
 *
 * Corrige três falhas do legado:
 *  • gravava em '../uploads/' e lia de DOCUMENT_ROOT.'/uploads/' (caminhos divergentes)
 *  • aceitava qualquer extensão, inclusive .php
 *  • nunca removia o arquivo antigo ao trocar a foto
 *
 * Onde o byte fica é decisão do `Armazenamento` injetado (disco ou Supabase
 * Storage) — este service cuida só do que não muda entre os dois: allowlist de
 * MIME, limite de tamanho, nome em UUID e a forma da URL guardada no banco.
 */
@Injectable()
export class UploadsService {
  private readonly tamanhoMaximo: number;

  constructor(
    private readonly config: ConfigService,
    @Inject(ARMAZENAMENTO) private readonly armazenamento: Armazenamento,
  ) {
    this.tamanhoMaximo =
      Number(this.config.get<number>('UPLOAD_MAX_SIZE_MB', 5)) * 1024 * 1024;
  }

  /** Salva o arquivo e devolve a URL relativa (ex.: /uploads/clientes/x.jpg). */
  async salvarImagem(
    arquivo: Express.Multer.File,
    pasta: PastaUpload,
  ): Promise<string> {
    return this.salvarEnviado(arquivo, pasta, MIMES_PERMITIDOS);
  }

  /** Salva uma evidência de etapa (PDF, planilha, imagem) e devolve a URL. */
  async salvarDocumento(
    arquivo: Express.Multer.File,
    pasta: PastaUpload,
  ): Promise<string> {
    return this.salvarEnviado(arquivo, pasta, MIMES_DOCUMENTO);
  }

  /**
   * Grava um arquivo produzido pelo próprio sistema (ex.: PDF de certificado).
   *
   * Não passa pelo allowlist de MIME porque não há upload nem entrada do
   * usuário: o conteúdo e a extensão são definidos pelo serviço que gerou o
   * arquivo. O nome continua vindo de `randomUUID()`.
   */
  async salvarArquivoGerado(
    conteudo: Buffer,
    pasta: PastaUpload,
    extensao: string,
  ): Promise<string> {
    const nomeArquivo = `${randomUUID()}${extensao}`;

    await this.armazenamento.gravar(
      pasta,
      nomeArquivo,
      conteudo,
      mimeDaExtensao(extensao),
    );

    return `${PREFIXO_UPLOADS}${pasta}/${nomeArquivo}`;
  }

  /**
   * Bytes de um arquivo salvo, ou `null` se ele não existe mais.
   *
   * Substitui o antigo `caminhoAbsoluto`: caminho em disco só faz sentido para
   * um dos drivers, e quem chama (PDF de certificado, evidência de etapa) quer
   * o conteúdo, não o caminho. O `null` cobre os dois casos que já eram
   * tratados — URL fora do padrão e arquivo ausente — com a mesma resposta.
   */
  async ler(urlRelativa?: string | null): Promise<Buffer | null> {
    const partes = arquivoDeUpload(urlRelativa);
    if (!partes) return null;

    return this.armazenamento.ler(partes.pasta, partes.arquivo);
  }

  /** Remove um arquivo previamente salvo. Falhas são apenas registradas em log. */
  async remover(urlRelativa?: string | null): Promise<void> {
    const partes = arquivoDeUpload(urlRelativa);
    if (!partes) return;

    await this.armazenamento.remover(partes.pasta, partes.arquivo);
  }

  /** Substitui a foto atual removendo a anterior. */
  async substituirImagem(
    arquivo: Express.Multer.File,
    pasta: PastaUpload,
    urlAnterior?: string | null,
  ): Promise<string> {
    const novaUrl = await this.salvarImagem(arquivo, pasta);
    await this.remover(urlAnterior);
    return novaUrl;
  }

  private async salvarEnviado(
    arquivo: Express.Multer.File,
    pasta: PastaUpload,
    permitidos: Record<string, string>,
  ): Promise<string> {
    this.validar(arquivo, permitidos);

    const extensao = permitidos[arquivo.mimetype] ?? extname(arquivo.originalname);
    const nomeArquivo = `${randomUUID()}${extensao}`;

    await this.armazenamento.gravar(
      pasta,
      nomeArquivo,
      arquivo.buffer,
      arquivo.mimetype,
    );

    return `${PREFIXO_UPLOADS}${pasta}/${nomeArquivo}`;
  }

  private validar(
    arquivo: Express.Multer.File,
    permitidos: Record<string, string> = MIMES_PERMITIDOS,
  ): void {
    if (!arquivo) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }
    if (!permitidos[arquivo.mimetype]) {
      throw new BadRequestException(
        `Formato não permitido. Aceitos: ${Object.keys(permitidos).join(', ')}.`,
      );
    }
    if (arquivo.size > this.tamanhoMaximo) {
      throw new BadRequestException(
        `Arquivo muito grande. Máximo: ${this.tamanhoMaximo / 1024 / 1024} MB.`,
      );
    }
  }
}
