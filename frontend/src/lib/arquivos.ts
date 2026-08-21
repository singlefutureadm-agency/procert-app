/**
 * Resolução de URL de arquivo enviado (`/uploads/...`).
 *
 * Módulo próprio, sem nenhum import, por dois motivos: `lib/tema.ts` precisa
 * disto antes de o React montar (o papel de parede é aplicado no primeiro
 * paint) e não deve arrastar o axios junto; e assim não há risco de ciclo com
 * `lib/api.ts`, que reexporta `urlArquivo` para os componentes que já o
 * importavam de lá.
 */

/**
 * Origem de onde a API serve os arquivos.
 *
 * Em desenvolvimento e em deploy de mesma origem, `VITE_API_URL` é `/api` e o
 * caminho relativo já resolve sozinho — o proxy do Vite ou o do Apache leva a
 * requisição ao Node. Quando a API mora em outro host, `/uploads/foto.png`
 * bateria no domínio do SITE, que não tem esse arquivo, e toda foto de produto,
 * avatar e logo viraria imagem quebrada. Aqui a origem é derivada do próprio
 * `VITE_API_URL` justamente para não existir uma segunda variável capaz de sair
 * de sincronia com a primeira.
 *
 * O `/api` do fim é descartado de propósito: `/uploads` é irmão do prefixo da
 * API, não filho dele.
 */
const ORIGEM_ARQUIVOS = ((): string => {
  const base = import.meta.env.VITE_API_URL || '/api';
  if (!/^https?:\/\//i.test(base)) return '';

  try {
    return new URL(base).origin;
  } catch {
    // URL malformada no build: cair para caminho relativo quebra as imagens,
    // mas mantém o painel de pé — melhor que derrubar o módulo inteiro.
    return '';
  }
})();

/**
 * Converte o caminho que a API devolve na URL que o `<img>` consegue carregar.
 *
 * @param caminho `/uploads/produtos/uuid.png`, uma URL absoluta, ou nada.
 * @param padrao  Placeholder usado quando não há arquivo.
 */
export function urlArquivo(
  caminho: string | null | undefined,
  padrao = '/placeholder-usuario.svg',
): string {
  if (!caminho) return padrao;
  // Já absoluto (veio de fora, ou de um storage externo): não mexe.
  if (/^https?:\/\//i.test(caminho)) return caminho;
  return ORIGEM_ARQUIVOS + caminho;
}
