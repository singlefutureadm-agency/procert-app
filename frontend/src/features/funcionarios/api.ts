import { api } from '@/lib/api';
import type { Funcionario, RespostaPaginada, StatusRegistro } from '@/types';

export type RoleEquipe = 'ADMIN' | 'FUNCIONARIO';

export interface FiltrosFuncionarios {
  pagina?: number;
  limite?: number;
  busca?: string;
  status?: StatusRegistro;
  role?: RoleEquipe;
}

export interface DadosFuncionario {
  nome: string;
  email: string;
  senha?: string;
  role: RoleEquipe;
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

export const funcionariosApi = {
  listar: async (filtros: FiltrosFuncionarios) => {
    const { data } = await api.get<RespostaPaginada<Funcionario>>('/funcionarios', {
      params: filtros,
    });
    return data;
  },

  buscar: async (id: number) => {
    const { data } = await api.get<Funcionario>(`/funcionarios/${id}`);
    return data;
  },

  criar: async (dados: DadosFuncionario) => {
    const { data } = await api.post<Funcionario>('/funcionarios', dados);
    return data;
  },

  atualizar: async (id: number, dados: Partial<DadosFuncionario>) => {
    const { data } = await api.patch<Funcionario>(`/funcionarios/${id}`, dados);
    return data;
  },

  alterarStatus: async (id: number, status: StatusRegistro) => {
    const { data } = await api.patch<Funcionario>(`/funcionarios/${id}/status`, {
      status,
    });
    return data;
  },

  remover: async (id: number) => {
    const { data } = await api.delete<{ mensagem: string }>(`/funcionarios/${id}`);
    return data;
  },

  enviarFoto: async (id: number, arquivo: File) => {
    const formulario = new FormData();
    formulario.append('foto', arquivo);

    const { data } = await api.post<Funcionario>(`/funcionarios/${id}/foto`, formulario, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
};
