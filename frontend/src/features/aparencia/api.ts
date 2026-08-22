import { api } from '@/lib/api';
import type { AjustePapelParede, Aparencia, ModoTema, TokensTema } from '@/types';

export interface DadosAparencia {
  temaClaro: TokensTema;
  temaEscuro: TokensTema;
  /** Id do catálogo de fontes. */
  fonte: string;
  temaPadrao: ModoTema;
  permitirAlternancia: boolean;
  papelParedeOpacidade: number;
  papelParedeAjuste: AjustePapelParede;
  /** `atualizadoEm` lido ao abrir a tela — o servidor devolve 409 se mudou. */
  atualizadoEmVisto?: string;
}

/** Cada tema tem a própria logo, em rotas separadas. */
const rotaDaLogo = (tema: ModoTema) =>
  tema === 'CLARO' ? '/aparencia/logo/tema-claro' : '/aparencia/logo/tema-escuro';

/**
 * As URLs de logo e papel de parede não trafegam neste corpo de propósito: só
 * os endpoints de upload as definem, para que não seja possível apontar a marca
 * do painel para um domínio externo.
 */
export const aparenciaApi = {
  buscar: async () => {
    const { data } = await api.get<Aparencia>('/aparencia');
    return data;
  },

  salvar: async (dados: DadosAparencia) => {
    const { data } = await api.put<Aparencia>('/aparencia', dados);
    return data;
  },

  restaurarPadrao: async () => {
    const { data } = await api.post<Aparencia>('/aparencia/restaurar-padrao');
    return data;
  },

  enviarLogo: (tema: ModoTema, arquivo: File) =>
    enviarImagem(rotaDaLogo(tema), arquivo),
  removerLogo: async (tema: ModoTema) => {
    const { data } = await api.delete<Aparencia>(rotaDaLogo(tema));
    return data;
  },

  enviarPapelParede: (arquivo: File) =>
    enviarImagem('/aparencia/papel-parede', arquivo),
  removerPapelParede: async () => {
    const { data } = await api.delete<Aparencia>('/aparencia/papel-parede');
    return data;
  },
};

async function enviarImagem(rota: string, arquivo: File): Promise<Aparencia> {
  const formulario = new FormData();
  formulario.append('imagem', arquivo);

  const { data } = await api.post<Aparencia>(rota, formulario, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
