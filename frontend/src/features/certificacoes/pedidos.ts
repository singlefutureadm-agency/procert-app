import type { DocumentoMicroEtapa, MicroEtapaCertificacao, SituacaoDocumento } from '@/types';

/**
 * A regra do documento pedido ao cliente, num lugar só.
 *
 * Espelha `DocumentosCertificacaoService.temDocumentoAceito` no backend — e é
 * espelho de propósito, não duplicação acidental: o backend é quem decide, e
 * aqui a mesma régua existe só para **não oferecer o clique que vai falhar**.
 * Divergir faria a tela habilitar uma marcação que o servidor recusa, com um
 * toast genérico longe do item.
 *
 * Vive fora dos componentes porque era a mesma regra escrita duas vezes — no
 * checklist da equipe e no bloco do cliente —, e a segunda cópia é sempre a que
 * envelhece.
 */

/** Rótulos em TEXTO. Nenhuma situação é distinguida só por cor. */
export const ROTULO_SITUACAO: Record<SituacaoDocumento, string> = {
  PENDENTE: 'Em análise',
  ACEITO: 'Aceito',
  RECUSADO: 'Recusado',
};

/**
 * Classe do badge por situação.
 *
 * Mesma regra dos gráficos: a cor acompanha, nunca carrega a informação.
 * `--cor-sucesso` × `--cor-erro` têm ΔE 5,0 sob deuteranopia — abaixo do piso —,
 * e nesta tela a diferença entre "aceito" e "recusado" decide se o cliente
 * reenvia o arquivo. O rótulo de `ROTULO_SITUACAO` vai sempre junto.
 */
export const CLASSE_SITUACAO: Record<SituacaoDocumento, string> = {
  PENDENTE: 'badge badge--pendente',
  ACEITO: 'badge badge--aprovado',
  RECUSADO: 'badge badge--reprovado',
};

/**
 * O envio que vale — o mais recente.
 *
 * O backend devolve a lista em `id` DESCENDENTE, então é o primeiro. A ordem é
 * contrato: invertida, a tela mostraria o parecer de uma recusa antiga ao lado
 * de um arquivo novo que ninguém olhou ainda.
 */
export function ultimoEnvio(
  micro: MicroEtapaCertificacao,
): DocumentoMicroEtapa | null {
  return micro.documentos.at(0) ?? null;
}

/**
 * O item tem um envio ACEITO?
 *
 * `ACEITO`, e não "tem documento": um `PENDENTE` ainda não foi olhado e um
 * `RECUSADO` foi olhado e negado. Olha a lista INTEIRA, não só o último — se um
 * aceite anterior existe, o item está liberado, mesmo que um reenvio posterior
 * esteja em análise.
 */
export function temAceite(micro: MicroEtapaCertificacao): boolean {
  return micro.documentos.some((documento) => documento.situacao === 'ACEITO');
}

/**
 * O item espera um aceite que ainda não houve — ou seja, não pode ser marcado.
 *
 * Item que não pede documento nunca espera nada: a regra vale só para
 * `exigeDocumento`, e tratar os dois iguais travaria o checklist inteiro.
 */
export function esperandoAceite(micro: MicroEtapaCertificacao): boolean {
  if (!micro.exigeDocumento) return false;
  return !temAceite(micro);
}

/** O que dizer ao lado de um item que pede documento. */
export function situacaoDoPedido(micro: MicroEtapaCertificacao): string {
  const atual = ultimoEnvio(micro);

  if (!atual) return 'aguardando documento do cliente';
  if (atual.situacao === 'PENDENTE') return 'documento em análise';
  if (atual.situacao === 'RECUSADO') return 'documento recusado — aguardando reenvio';
  return 'documento aceito';
}

/**
 * O cliente precisa enviar (ou reenviar) algo?
 *
 * Verdadeiro sem nenhum envio e depois de uma recusa. **Falso enquanto há
 * `PENDENTE`**: oferecer "reenviar" para quem acabou de enviar convida a mandar
 * o mesmo arquivo duas vezes e a equipe a julgar duas linhas idênticas.
 */
export function aguardandoEnvioDoCliente(micro: MicroEtapaCertificacao): boolean {
  const atual = ultimoEnvio(micro);
  return !atual || atual.situacao === 'RECUSADO';
}
