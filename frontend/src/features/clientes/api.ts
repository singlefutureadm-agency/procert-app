import { api } from '@/lib/api';
import type {
  Cliente,
  Estado,
  RespostaPaginada,
  StatusRegistro,
} from '@/types';

export interface FiltrosClientes {
  pagina?: number;
  limite?: number;
  busca?: string;
  status?: StatusRegistro;
}

export interface DadosCliente {
  nome: string;
  email: string;
  senha?: string;
  tipoPessoa?: 'FISICA' | 'JURIDICA';
  cpf?: string;
  cnpj?: string;
  dataNascimento?: string;
  telefone?: string;
  cep?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  estadoId?: number;
}

export const clientesApi = {
  listar: async (filtros: FiltrosClientes) => {
    const { data } = await api.get<RespostaPaginada<Cliente>>('/clientes', {
      params: filtros,
    });
    return data;
  },

  resumo: async () => {
    const { data } = await api.get<Array<{ id: number; nome: string; email: string }>>(
      '/clientes/resumo',
    );
    return data;
  },

  buscar: async (id: number) => {
    const { data } = await api.get<Cliente>(`/clientes/${id}`);
    return data;
  },

  criar: async (dados: DadosCliente) => {
    const { data } = await api.post<Cliente>('/clientes', dados);
    return data;
  },

  atualizar: async (id: number, dados: Partial<DadosCliente>) => {
    const { data } = await api.patch<Cliente>(`/clientes/${id}`, dados);
    return data;
  },

  alterarStatus: async (id: number, status: StatusRegistro) => {
    const { data } = await api.patch<Cliente>(`/clientes/${id}/status`, { status });
    return data;
  },

  remover: async (id: number) => {
    const { data } = await api.delete<{ mensagem: string }>(`/clientes/${id}`);
    return data;
  },

  enviarFoto: async (id: number, arquivo: File) => {
    const formulario = new FormData();
    formulario.append('foto', arquivo);

    const { data } = await api.post<Cliente>(`/clientes/${id}/foto`, formulario, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
};

export const estadosApi = {
  listar: async () => {
    const { data } = await api.get<Estado[]>('/estados');
    return data;
  },
};
