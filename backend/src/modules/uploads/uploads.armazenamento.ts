import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, normalize, resolve } from 'node:path';

import {
  ehPastaPublica,
  type PastaPublica,
  type PastaUpload,
} from './uploads.constantes';

/**
 * Onde os arquivos enviados realmente ficam.
 *
 * Existe porque o disco deixou de ser uma escolha universal: em serverless
 * (Vercel) o filesystem é efêmero e recriado a cada instância fria, então uma
 * evidência de etapa gravada com `writeFile` desaparece sem erro nenhum — o
 * registro no banco continua apontando para um arquivo que não existe mais.
 *
 * O `UploadsService` conversa só com esta interface. A forma da URL guardada no
 * banco (`/uploads/<pasta>/<uuid>.<ext>`) é a mesma nos dois drivers, de
 * propósito: linhas gravadas antes da migração continuam válidas, e o frontend
 * não precisa saber de onde o byte veio.
 */
export interface Armazenamento {
  /** Identifica o driver no log de boot. */
  readonly nome: string;

  gravar(
    pasta: PastaUpload,
    nomeArquivo: string,
    conteudo: Buffer,
    tipoMime: string,
  ): Promise<void>;

  /** Bytes do arquivo, ou `null` se ele não existe mais. */
  ler(pasta: PastaUpload, nomeArquivo: string): Promise<Buffer | null>;

  /** Falha é registrada em log, nunca propagada: remover é sempre acessório. */
  remover(pasta: PastaUpload, nomeArquivo: string): Promise<void>;

  /**
   * URL absoluta que um `<img src>` consegue buscar sem Bearer, ou `null` se
   * este driver não publica nada por conta própria — é o caso do disco, onde
   * quem serve é o `useStaticAssets` do próprio Nest.
   */
  urlPublica(pasta: PastaPublica, nomeArquivo: string): string | null;
}

/** Extensão → MIME, só para o que o sistema gera por conta própria. */
const MIME_POR_EXTENSAO: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
};

export function mimeDaExtensao(extensao: string): string {
  return MIME_POR_EXTENSAO[extensao.toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Disco local — o comportamento histórico do projeto.
 *
 * Continua sendo o driver de desenvolvimento e o do e2e, que grava arquivos de
 * verdade e confere presença em disco antes de afirmar qualquer 404.
 */
export class ArmazenamentoDisco implements Armazenamento {
  readonly nome = 'disco';
  private readonly logger = new Logger(ArmazenamentoDisco.name);

  constructor(private readonly baseDir: string) {}

  /** O MIME não entra: em disco o tipo sai da extensão do próprio nome. */
  async gravar(
    pasta: PastaUpload,
    nomeArquivo: string,
    conteudo: Buffer,
    _tipoMime?: string,
  ): Promise<void> {
    const destino = join(this.baseDir, pasta);
    await mkdir(destino, { recursive: true });
    await writeFile(join(destino, nomeArquivo), conteudo);
  }

  async ler(pasta: PastaUpload, nomeArquivo: string): Promise<Buffer | null> {
    const caminho = this.caminho(pasta, nomeArquivo);
    if (!caminho) return null;

    try {
      return await readFile(caminho);
    } catch {
      return null;
    }
  }

  async remover(pasta: PastaUpload, nomeArquivo: string): Promise<void> {
    const caminho = this.caminho(pasta, nomeArquivo);
    if (!caminho) return;

    try {
      await unlink(caminho);
    } catch (erro) {
      this.logger.warn(
        `Não foi possível remover ${pasta}/${nomeArquivo}: ${(erro as Error).message}`,
      );
    }
  }

  urlPublica(): null {
    return null;
  }

  /**
   * Caminho absoluto confinado a `baseDir`.
   *
   * O `UploadsService` já recusa segmento de travessia antes de chegar aqui;
   * esta é a segunda barreira, mantida porque era a proteção original e porque
   * a confinação não deve depender da diligência de quem chama.
   */
  caminho(pasta: PastaUpload, nomeArquivo: string): string | null {
    const resolvido = normalize(join(this.baseDir, pasta, nomeArquivo));
    return resolvido.startsWith(this.baseDir) ? resolvido : null;
  }
}

/** Configuração mínima para falar com o Storage. */
export interface ConfiguracaoSupabase {
  url: string;
  chaveServico: string;
  bucketPublico: string;
  bucketPrivado: string;
}

/**
 * Supabase Storage.
 *
 * Fala o REST do Storage por `fetch` em vez de trazer o `@supabase/supabase-js`:
 * o SDK carrega junto PostgREST, realtime e um cliente de auth que este projeto
 * não usa — a mesma razão pela qual o painel não tem biblioteca de gráficos nem
 * de ícones.
 *
 * A separação em dois buckets espelha `PASTAS_PUBLICAS` × `PASTAS_PRIVADAS`. O
 * bucket privado **não** sai por URL assinada: PDF de certificado e evidência de
 * etapa continuam saindo por `GET /certificados/:id/pdf` e
 * `GET /certificacoes/documentos/:id/arquivo`, que aplicam o escopo do CLIENTE.
 * URL assinada seria um segundo caminho de acesso ao mesmo byte, com uma segunda
 * chance de esquecer a checagem de posse.
 */
export class ArmazenamentoSupabase implements Armazenamento {
  readonly nome = 'supabase-storage';
  private readonly logger = new Logger(ArmazenamentoSupabase.name);

  constructor(private readonly config: ConfiguracaoSupabase) {}

  async gravar(
    pasta: PastaUpload,
    nomeArquivo: string,
    conteudo: Buffer,
    tipoMime: string,
  ): Promise<void> {
    const resposta = await fetch(this.endpoint(pasta, nomeArquivo), {
      method: 'POST',
      headers: {
        ...this.cabecalhos(),
        'Content-Type': tipoMime,
        // Nome é UUID: colisão só aconteceria em reenvio do mesmo arquivo, e
        // sobrescrever é o resultado correto nesse caso.
        'x-upsert': 'true',
      },
      body: new Uint8Array(conteudo),
    });

    if (!resposta.ok) {
      // Propaga: gravar é a operação principal. Engolir o erro aqui gravaria no
      // banco a URL de um arquivo que nunca existiu.
      throw new Error(
        `Falha ao enviar ${pasta}/${nomeArquivo} para o Supabase Storage ` +
          `(${resposta.status}): ${await resposta.text()}`,
      );
    }
  }

  async ler(pasta: PastaUpload, nomeArquivo: string): Promise<Buffer | null> {
    const resposta = await fetch(this.endpoint(pasta, nomeArquivo), {
      headers: this.cabecalhos(),
    });

    if (!resposta.ok) return null;

    return Buffer.from(await resposta.arrayBuffer());
  }

  async remover(pasta: PastaUpload, nomeArquivo: string): Promise<void> {
    try {
      const resposta = await fetch(this.endpoint(pasta, nomeArquivo), {
        method: 'DELETE',
        headers: this.cabecalhos(),
      });

      if (!resposta.ok) {
        this.logger.warn(
          `Não foi possível remover ${pasta}/${nomeArquivo}: ${resposta.status}`,
        );
      }
    } catch (erro) {
      this.logger.warn(
        `Não foi possível remover ${pasta}/${nomeArquivo}: ${(erro as Error).message}`,
      );
    }
  }

  urlPublica(pasta: PastaPublica, nomeArquivo: string): string {
    return (
      `${this.config.url}/storage/v1/object/public/` +
      `${this.config.bucketPublico}/${pasta}/${nomeArquivo}`
    );
  }

  private endpoint(pasta: PastaUpload, nomeArquivo: string): string {
    const bucket = ehPastaPublica(pasta)
      ? this.config.bucketPublico
      : this.config.bucketPrivado;

    return `${this.config.url}/storage/v1/object/${bucket}/${pasta}/${nomeArquivo}`;
  }

  private cabecalhos(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.chaveServico}`,
      apikey: this.config.chaveServico,
    };
  }
}

/** Token de injeção do driver. */
export const ARMAZENAMENTO = Symbol('Armazenamento');

/**
 * Escolhe o driver a partir do ambiente.
 *
 * O padrão é o disco: nada muda para quem roda localmente, nem para o e2e, que
 * grava arquivos de verdade e confere presença em disco antes de afirmar
 * qualquer 404. `UPLOAD_DRIVER=supabase` é uma decisão explícita — detectar
 * pela mera presença de `SUPABASE_URL` faria o ambiente virar sozinho ao lado
 * de uma variável esquecida no `.env`.
 *
 * Faltando configuração, quebra no boot em vez de degradar para o disco: num
 * ambiente serverless a degradação silenciosa grava evidência num filesystem
 * efêmero, e o registro no banco aponta para um arquivo que some sem erro.
 */
export function criarArmazenamento(config: ConfigService): Armazenamento {
  const driver = config.get<string>('UPLOAD_DRIVER', 'disco');

  if (driver === 'disco') {
    // `resolve`, e não `join`: UPLOAD_DIR absoluto (`/var/dados/uploads`) é
    // plausível num servidor, e `join` o concatenaria ao cwd em vez de
    // respeitá-lo. O `bootstrap` resolve a mesma variável do mesmo jeito — os
    // dois precisam apontar para o mesmo diretório.
    return new ArmazenamentoDisco(
      resolve(process.cwd(), config.get<string>('UPLOAD_DIR', './uploads')),
    );
  }

  if (driver !== 'supabase') {
    throw new Error(
      `UPLOAD_DRIVER inválido: "${driver}". Use "disco" ou "supabase".`,
    );
  }

  const url = config.get<string>('SUPABASE_URL', '').replace(/\/+$/, '');
  const chaveServico = config.get<string>('SUPABASE_SERVICE_ROLE_KEY', '');
  const faltando = [
    ...(url ? [] : ['SUPABASE_URL']),
    ...(chaveServico ? [] : ['SUPABASE_SERVICE_ROLE_KEY']),
  ];

  if (faltando.length > 0) {
    throw new Error(
      `UPLOAD_DRIVER=supabase exige ${faltando.join(' e ')}. ` +
        'Sem isso os uploads iriam para um filesystem efêmero e sumiriam.',
    );
  }

  return new ArmazenamentoSupabase({
    url,
    chaveServico,
    bucketPublico: config.get<string>(
      'SUPABASE_BUCKET_PUBLICO',
      'procert-publico',
    ),
    bucketPrivado: config.get<string>(
      'SUPABASE_BUCKET_PRIVADO',
      'procert-privado',
    ),
  });
}
