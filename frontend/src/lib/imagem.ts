/**
 * Redimensiona e recomprime imagens no navegador antes do upload.
 *
 * Existe por causa de um erro que chegava ao usuário como "bloqueado por CORS".
 * O corpo de uma requisição na Vercel para em **4,5 MB**, e esse corte é feito
 * pela plataforma, antes da função rodar: a resposta 413 sai sem passar pelo
 * middleware de CORS, então o navegador não vê `Access-Control-Allow-Origin` e
 * relata falha de CORS — escondendo o problema real, que é o tamanho.
 *
 * Validar o tamanho no cliente resolveria o erro enganoso, mas ainda recusaria
 * a foto. Uma câmera de celular produz 6–12 MB, e uma foto de perfil exibida a
 * 96px não precisa disso. Redimensionar antes de enviar transforma a recusa em
 * upload bem-sucedido — e de quebra encurta a espera e o que se paga de
 * armazenamento.
 *
 * Roda em `<canvas>`: nenhuma dependência nova, pelo mesmo critério que manteve
 * gráficos e ícones sem biblioteca.
 */

export interface OpcoesImagem {
  /** Maior dimensão aceita, em pixels. A proporção é preservada. */
  ladoMaximo: number;
  /** Qualidade de 0 a 1, para formatos com perda. */
  qualidade: number;
}

/** Fotos de pessoa e miniaturas de produto: exibidas pequenas, nunca ampliadas. */
export const PERFIL: OpcoesImagem = { ladoMaximo: 1024, qualidade: 0.85 };

/** Acima disto nem tentamos ler o arquivo: é foto de câmera profissional ou
 *  algo que não é foto de perfil, e decodificar custaria memória à toa. */
const LIMITE_ENTRADA_BYTES = 25 * 1024 * 1024;

/** O que o backend aceita (`UPLOAD_MAX_SIZE_MB`), e abaixo do corte da Vercel. */
export const LIMITE_ENVIO_BYTES = 4 * 1024 * 1024;

export class ImagemInvalidaError extends Error {}

function ehImagem(arquivo: File): boolean {
  return arquivo.type.startsWith('image/');
}

/**
 * O formato de saída preserva transparência quando ela existe.
 *
 * Converter PNG para JPEG achataria o fundo transparente em preto — e é
 * justamente o caso de uma logo enviada na tela de Aparência.
 */
function formatoDeSaida(tipoOriginal: string): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (tipoOriginal === 'image/png' || tipoOriginal === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

function extensaoDe(tipo: string): string {
  if (tipo === 'image/webp') return 'webp';
  if (tipo === 'image/png') return 'png';
  return 'jpg';
}

/** Troca a extensão do nome preservando o resto — o servidor deriva o tipo dela. */
function renomear(nome: string, extensao: string): string {
  return `${nome.replace(/\.[^./\\]+$/, '')}.${extensao}`;
}

async function carregar(arquivo: File): Promise<ImageBitmap | HTMLImageElement> {
  // `createImageBitmap` decodifica fora da thread principal e evita travar a
  // interface com fotos grandes. Safari antigo não o tem; daí o caminho abaixo.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(arquivo);
    } catch {
      // Formato que o decodificador acelerado recusa (alguns WebP animados):
      // segue pelo <img>, que é mais permissivo.
    }
  }

  const url = URL.createObjectURL(arquivo);
  try {
    return await new Promise<HTMLImageElement>((resolver, rejeitar) => {
      const img = new Image();
      img.onload = () => resolver(img);
      img.onerror = () => rejeitar(new ImagemInvalidaError('Não foi possível ler a imagem.'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Devolve o arquivo pronto para envio.
 *
 * Um arquivo que já cabe no limite e nas dimensões volta **intacto**: recomprimir
 * o que já está bom só degradaria a imagem.
 */
export async function prepararImagem(
  arquivo: File,
  opcoes: OpcoesImagem = PERFIL,
): Promise<File> {
  if (!ehImagem(arquivo)) {
    throw new ImagemInvalidaError('O arquivo escolhido não é uma imagem.');
  }

  if (arquivo.size > LIMITE_ENTRADA_BYTES) {
    throw new ImagemInvalidaError(
      'Imagem muito grande para ser processada. Envie um arquivo de até 25 MB.',
    );
  }

  const fonte = await carregar(arquivo);
  const largura = 'width' in fonte ? fonte.width : 0;
  const altura = 'height' in fonte ? fonte.height : 0;

  if (!largura || !altura) {
    throw new ImagemInvalidaError('Não foi possível ler as dimensões da imagem.');
  }

  const maiorLado = Math.max(largura, altura);
  const escala = Math.min(1, opcoes.ladoMaximo / maiorLado);

  // Já está pequena o bastante nos dois sentidos: não há o que ganhar.
  if (escala === 1 && arquivo.size <= LIMITE_ENVIO_BYTES) {
    if ('close' in fonte) fonte.close();
    return arquivo;
  }

  const tela = document.createElement('canvas');
  tela.width = Math.round(largura * escala);
  tela.height = Math.round(altura * escala);

  const contexto = tela.getContext('2d');
  if (!contexto) throw new ImagemInvalidaError('O navegador não pôde processar a imagem.');

  contexto.imageSmoothingQuality = 'high';
  contexto.drawImage(fonte as CanvasImageSource, 0, 0, tela.width, tela.height);
  if ('close' in fonte) fonte.close();

  const tipoSaida = formatoDeSaida(arquivo.type);
  const blob = await new Promise<Blob | null>((resolver) =>
    tela.toBlob(resolver, tipoSaida, opcoes.qualidade),
  );

  if (!blob) throw new ImagemInvalidaError('Não foi possível converter a imagem.');

  // Caso raro: mesmo reduzida a imagem ainda não cabe (PNG enorme sem perda que
  // vira WebP grande). Melhor recusar com mensagem clara do que deixar a
  // plataforma cortar e o navegador chamar de CORS.
  if (blob.size > LIMITE_ENVIO_BYTES) {
    throw new ImagemInvalidaError(
      'Não foi possível reduzir a imagem o suficiente. Tente uma imagem menor.',
    );
  }

  return new File([blob], renomear(arquivo.name, extensaoDe(tipoSaida)), {
    type: tipoSaida,
    lastModified: Date.now(),
  });
}

/** Tamanho legível, para mensagens ("2,4 MB"). */
export function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
