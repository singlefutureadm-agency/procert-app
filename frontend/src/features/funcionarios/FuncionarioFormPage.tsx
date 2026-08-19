import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { Campo } from '@/components/Campo';
import { Icone } from '@/components/Icone';
import { Carregando } from '@/components/Carregando';
import { estadosApi } from '@/features/clientes/api';
import { mensagemDeErro, urlArquivo } from '@/lib/api';
import { paraInputDate } from '@/lib/formatadores';
import { chaves } from '@/lib/queryClient';
import { funcionariosApi, type DadosFuncionario } from './api';

const senhaValida = z
  .string()
  .min(8, 'Mínimo de 8 caracteres.')
  .regex(/\d/, 'Inclua ao menos um número.')
  .regex(/[A-Za-zÀ-ÿ]/, 'Inclua ao menos uma letra.');

const esquema = z.object({
  nome: z.string().min(3, 'Informe o nome completo.'),
  email: z.string().email('Informe um e-mail válido.'),
  senha: z.union([senhaValida, z.literal('')]).optional(),
  role: z.enum(['ADMIN', 'FUNCIONARIO']),
  cpf: z.string().optional(),
  dataNascimento: z.string().optional(),
  telefone: z.string().optional(),
  cep: z
    .union([z.string().regex(/^\d{5}-?\d{3}$/, 'CEP inválido.'), z.literal('')])
    .optional(),
  endereco: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  estadoId: z.string().optional(),
});

type Formulario = z.infer<typeof esquema>;

export function FuncionarioFormPage() {
  const { id } = useParams();
  const funcionarioId = id ? Number(id) : undefined;
  const editando = Boolean(funcionarioId);

  const navegar = useNavigate();
  const queryClient = useQueryClient();
  const [foto, setFoto] = useState<File | null>(null);

  const { data: estados } = useQuery({
    queryKey: chaves.estados,
    queryFn: estadosApi.listar,
    staleTime: Infinity,
  });

  const { data: integrante, isLoading } = useQuery({
    queryKey: chaves.funcionario(funcionarioId!),
    queryFn: () => funcionariosApi.buscar(funcionarioId!),
    enabled: editando,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Formulario>({
    resolver: zodResolver(esquema),
    defaultValues: { role: 'FUNCIONARIO' },
  });

  useEffect(() => {
    if (!integrante) return;

    reset({
      nome: integrante.nome,
      email: integrante.email,
      senha: '',
      role: integrante.role,
      cpf: integrante.cpf ?? '',
      dataNascimento: paraInputDate(integrante.dataNascimento),
      telefone: integrante.telefone ?? '',
      cep: integrante.cep ?? '',
      endereco: integrante.endereco ?? '',
      bairro: integrante.bairro ?? '',
      cidade: integrante.cidade ?? '',
      estadoId: integrante.estadoId ? String(integrante.estadoId) : '',
    });
  }, [integrante, reset]);

  const salvar = useMutation({
    mutationFn: async (formulario: Formulario) => {
      const dados: DadosFuncionario = {
        nome: formulario.nome,
        email: formulario.email,
        role: formulario.role,
        tipoPessoa: 'FISICA',
        cpf: formulario.cpf || undefined,
        dataNascimento: formulario.dataNascimento || undefined,
        telefone: formulario.telefone || undefined,
        cep: formulario.cep || undefined,
        endereco: formulario.endereco || undefined,
        bairro: formulario.bairro || undefined,
        cidade: formulario.cidade || undefined,
        estadoId: formulario.estadoId ? Number(formulario.estadoId) : undefined,
        ...(formulario.senha ? { senha: formulario.senha } : {}),
      };

      const registro = editando
        ? await funcionariosApi.atualizar(funcionarioId!, dados)
        : await funcionariosApi.criar(dados);

      if (foto) {
        await funcionariosApi.enviarFoto(registro.id, foto);
      }

      return registro;
    },
    onSuccess: () => {
      toast.success(editando ? 'Cadastro atualizado.' : 'Integrante cadastrado.');
      void queryClient.invalidateQueries({ queryKey: ['funcionarios'] });
      navegar('/equipe');
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  if (editando && isLoading) return <Carregando />;

  return (
    <>
      <CabecalhoPagina
        titulo={editando ? 'Editar integrante' : 'Novo integrante'}
        descricao="Administradores têm acesso total; funcionários não gerenciam a equipe."
        acoes={
          <Link to="/equipe" className="btn">
            <Icone nome="seta-esquerda" tamanho={16} />
            Voltar
          </Link>
        }
      />

      <form
        className="formulario"
        onSubmit={handleSubmit((dados) => salvar.mutate(dados))}
        noValidate
      >
        <fieldset className="secao-form">
          <legend>Acesso</legend>
          <div className="form-grade">
            <Campo label="Nome completo" erro={errors.nome?.message} obrigatorio>
              <input type="text" {...register('nome')} />
            </Campo>

            <Campo label="E-mail (login)" erro={errors.email?.message} obrigatorio>
              <input type="email" autoComplete="off" {...register('email')} />
            </Campo>

            <Campo label="Papel" erro={errors.role?.message} obrigatorio>
              <select {...register('role')}>
                <option value="FUNCIONARIO">Funcionário</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </Campo>

            <Campo
              label={editando ? 'Nova senha' : 'Senha'}
              erro={errors.senha?.message}
              dica={
                editando
                  ? 'Preencha apenas se quiser alterar.'
                  : 'Mínimo de 8 caracteres, com letras e números.'
              }
              obrigatorio={!editando}
            >
              <input type="password" autoComplete="new-password" {...register('senha')} />
            </Campo>
          </div>
        </fieldset>

        <fieldset className="secao-form">
          <legend>Dados pessoais</legend>
          <div className="form-grade">
            <Campo label="CPF">
              <input type="text" placeholder="000.000.000-00" {...register('cpf')} />
            </Campo>
            <Campo label="Data de nascimento">
              <input type="date" {...register('dataNascimento')} />
            </Campo>
            <Campo label="Telefone">
              <input type="tel" {...register('telefone')} />
            </Campo>
          </div>
        </fieldset>

        <fieldset className="secao-form">
          <legend>Endereço</legend>
          <div className="form-grade">
            <Campo label="CEP" erro={errors.cep?.message}>
              <input type="text" placeholder="00000-000" {...register('cep')} />
            </Campo>
            <Campo label="Logradouro">
              <input type="text" {...register('endereco')} />
            </Campo>
            <Campo label="Bairro">
              <input type="text" {...register('bairro')} />
            </Campo>
            <Campo label="Cidade">
              <input type="text" {...register('cidade')} />
            </Campo>
            <Campo label="UF">
              <select {...register('estadoId')}>
                <option value="">Selecione...</option>
                {estados?.map((estado) => (
                  <option key={estado.id} value={estado.id}>
                    {estado.sigla} — {estado.nome}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        </fieldset>

        <fieldset className="secao-form">
          <legend>Foto</legend>
          <div className="linha-flex">
            {integrante?.fotoUrl && (
              <img className="avatar" src={urlArquivo(integrante.fotoUrl)} alt="Foto atual" />
            )}
            <Campo label="Enviar imagem" dica="JPG, PNG ou WebP, até 5 MB.">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(evento) => setFoto(evento.target.files?.[0] ?? null)}
              />
            </Campo>
          </div>
        </fieldset>

        <div className="form-acoes">
          <Link to="/equipe" className="btn">
            Cancelar
          </Link>
          <button type="submit" className="btn btn--primario" disabled={salvar.isPending}>
            {salvar.isPending ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </>
  );
}
