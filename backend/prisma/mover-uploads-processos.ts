/**
 * Copia as fotos de `/uploads/produtos/` para `/uploads/processos/`.
 *
 * A migration `20260918120000_produto_vira_processo` reescreve `foto_url` no
 * banco, mas não alcança o armazenamento: no Supabase o arquivo é um objeto do
 * bucket, não uma linha. Este script completa a troca pelo mesmo driver que a
 * API usa (`UPLOAD_DRIVER`), então vale para o disco e para o Supabase.
 *
 * Idempotente e seguro em qualquer ordem em relação ao deploy:
 *  - lê as URLs nas duas formas (antes e depois da migration);
 *  - só copia quando o destino ainda não existe;
 *  - NUNCA apaga a origem sem `--remover-antigos`, e mesmo com ela só apaga
 *    depois de conferir que a cópia está lá.
 *
 * Roteiro: rode antes do deploy (copia), rode de novo depois (pega o que foi
 * enviado no meio), e só então `-- --remover-antigos`.
 *
 *   npm run mover:uploads-processos
 *   npm run mover:uploads-processos -- --remover-antigos
 */
import 'dotenv/config';

import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { extname } from 'node:path';

import { criarArmazenamento } from '../src/modules/uploads/uploads.armazenamento';
import type { PastaUpload } from '../src/modules/uploads/uploads.constantes';

const ANTIGA = 'produtos' as PastaUpload;
const NOVA: PastaUpload = 'processos';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

async function main(): Promise<void> {
  const remover = process.argv.includes('--remover-antigos');
  const prisma = new PrismaClient();
  const armazenamento = criarArmazenamento(new ConfigService());
  console.log(`[uploads] driver: ${armazenamento.nome}`);

  const linhas = await prisma.$queryRaw<Array<{ foto_url: string }>>`
    SELECT foto_url FROM processos
     WHERE foto_url LIKE '/uploads/produtos/%' OR foto_url LIKE '/uploads/processos/%'
  `;
  await prisma.$disconnect();

  let copiados = 0;
  let removidos = 0;
  const faltando: string[] = [];

  for (const { foto_url } of linhas) {
    const arquivo = foto_url.slice(foto_url.lastIndexOf('/') + 1);

    let destino = await armazenamento.ler(NOVA, arquivo);
    if (!destino) {
      const origem = await armazenamento.ler(ANTIGA, arquivo);
      if (!origem) {
        faltando.push(arquivo);
        continue;
      }
      const mime = MIME[extname(arquivo).toLowerCase()] ?? 'application/octet-stream';
      await armazenamento.gravar(NOVA, arquivo, origem, mime);
      destino = await armazenamento.ler(NOVA, arquivo);
      if (!destino) throw new Error(`Cópia de ${arquivo} não conferiu no destino.`);
      copiados++;
    }

    if (remover && (await armazenamento.ler(ANTIGA, arquivo))) {
      await armazenamento.remover(ANTIGA, arquivo);
      removidos++;
    }
  }

  console.log(
    `[uploads] ${linhas.length} foto(s) no banco · ${copiados} copiada(s)` +
      (remover ? ` · ${removidos} original(is) removido(s)` : ''),
  );
  if (faltando.length > 0) {
    // Já não existia em nenhuma das duas pastas: não é perda causada aqui,
    // mas vale saber.
    console.warn(`[uploads] sem arquivo em nenhuma pasta: ${faltando.join(', ')}`);
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
