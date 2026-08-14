import { api } from '@/lib/api';

export interface MensagemContato {
  nome: string;
  email: string;
  telefone?: string;
  assunto: string;
  mensagem: string;
}

/**
 * Envia o formulário do site para `POST /api/contato` (rota pública).
 *
 * No legado o form apontava para `forms/contact.php`, arquivo que não existia no
 * repositório — nenhuma mensagem enviada pelo site chegava a lugar algum.
 */
export const contatoApi = {
  enviar: async (dados: MensagemContato) => {
    const { data } = await api.post<{ id: number; mensagem: string }>(
      '/contato',
      dados,
    );
    return data;
  },
};
