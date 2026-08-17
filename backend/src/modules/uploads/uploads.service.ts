import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

export type PastaUpload =
  | 'clientes'
  | 'funcionarios'
  | 'produtos'
  | 'certificados'
  | 'certificacoes'
  /** Logo e papel de parede definidos pelo ADMIN na tela de Aparência. */
  | 'aparencia';

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
 * Armazenamento de imagens enviadas pelos usuários.
 *
 * Corrige três falhas do legado:
 *  • gravava em '../uploads/' e lia de DOCUMENT_ROOT.'/uploads/' (caminhos divergentes)
 *  • aceitava qualquer extensão, inclusive .php
 *  • nunca removia o arquivo antigo ao trocar a foto
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly baseDir: string;
  private readonly tamanhoMaximo: number;

  constructor(private readonly config: ConfigService) {
    this.baseDir = join(
      process.cwd(),
      this.config.get<string>('UPLOAD_DIR', './uploads'),
    );
    this.tamanhoMaximo =
      Number(this.config.get<number>('UPLOAD_MAX_SIZE_MB', 5)) * 1024 * 1024;
  }

  /** Salva o arquivo e devolve a URL pública relativa (ex.: /uploads/clientes/x.jpg). */
  async salvarImagem(
    arquivo: Express.Multer.File,
    pasta: PastaUpload,
  ): Promise<string> {
    this.validar(arquivo);

    const extensao = MIMES_PERMITIDOS[arquivo.mimetype] ?? extname(arquivo.originalname);
    const nomeArquivo = `${randomUUID()}${extensao}`;
    const destino = join(this.baseDir, pasta);

    await mkdir(destino, { recursive: true });
    await writeFile(join(destino, nomeArquivo), arquivo.buffer);

    return `/uploads/${pasta}/${nomeArquivo}`;
  }

  /** Salva uma evidência de etapa (PDF, planilha, imagem) e devolve a URL. */
  async salvarDocumento(
    arquivo: Express.Multer.File,
    pasta: PastaUpload,
  ): Promise<string> {
    this.validar(arquivo, MIMES_DOCUMENTO);

    const extensao =
      MIMES_DOCUMENTO[arquivo.mimetype] ?? extname(arquivo.originalname);
    const nomeArquivo = `${randomUUID()}${extensao}`;
    const destino = join(this.baseDir, pasta);

    await mkdir(destino, { recursive: true });
    await writeFile(join(destino, nomeArquivo), arquivo.buffer);

    return `/uploads/${pasta}/${nomeArquivo}`;
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
    const destino = join(this.baseDir, pasta);

    await mkdir(destino, { recursive: true });
    await writeFile(join(destino, nomeArquivo), conteudo);

    return `/uploads/${pasta}/${nomeArquivo}`;
  }

  /** Caminho absoluto de um arquivo salvo, para leitura/streaming. */
  caminhoAbsoluto(urlRelativa: string): string | null {
    if (!urlRelativa.startsWith('/uploads/')) return null;

    const caminho = normalize(
      join(this.baseDir, urlRelativa.replace('/uploads/', '')),
    );

    // Mesma proteção contra path traversal usada na remoção.
    return caminho.startsWith(this.baseDir) ? caminho : null;
  }

  /** Remove um arquivo previamente salvo. Falhas são apenas registradas em log. */
  async remover(urlRelativa?: string | null): Promise<void> {
    if (!urlRelativa?.startsWith('/uploads/')) return;

    const caminho = normalize(
      join(this.baseDir, urlRelativa.replace('/uploads/', '')),
    );

    // Proteção contra path traversal.
    if (!caminho.startsWith(this.baseDir)) return;

    try {
      await unlink(caminho);
    } catch (error) {
      this.logger.warn(
        `Não foi possível remover ${urlRelativa}: ${(error as Error).message}`,
      );
    }
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
