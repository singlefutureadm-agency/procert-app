import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { Campo } from '@/components/Campo';
import { CampoSenha } from '@/components/CampoSenha';
import { CampoArquivo } from '@/components/CampoArquivo';
import { Icone } from '@/components/Icone';
import { Carregando } from '@/components/Carregando';
import { mensagemDeErro, urlArquivo } from '@/lib/api';
import { paraInputDate } from '@/lib/formatadores';
import {
  mascararCep,
  mascararCnpj,
  mascararCpf,
  mascararTelefone,
} from '@/lib/mascaras';
import { usePreencherPorCep } from '@/lib/useCep';
import { chaves } from '@/lib/queryClient';
import { clientesApi, estadosApi, type DadosCliente } from './api';

const senhaValida = z
  .string()
  .min(8, 'Mínimo de 8 caracteres.')
  .regex(/\d/, 'Inclua ao menos um número.')
  .regex(/[A-Za-zÀ-ÿ]/, 'Inclua ao menos uma letra.');

const esquema = z.object({
  nome: z.string().min(3, 'Informe o nome completo.'),
  email: z.string().email('Informe um e-mail válido.'),
  /*
   * Opcional no schema base porque na EDIÇÃO em branco significa "manter a
   * senha atual". Na criação isso não vale — ver `esquemaDoModo` abaixo.
   */
  senha: z.union([senhaValida, z.literal('')]).optional(),
  tipoPessoa: z.enum(['FISICA', 'JURIDICA']),
  cpf: z.string().optional(),
  cnpj: z.string().optional(),
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

/**
 * O mesmo formulário serve para criar e editar, mas a senha não.
 *
 * Com o schema base nos dois casos, criar um cliente sem senha passava batido:
 * o zod aceitava, o envio omitia o campo e só o backend recusava — com um toast
 * genérico, sem marcar o campo. O usuário via "nome" e "e-mail" acusarem erro,
 * corrigia, salvava de novo e só então descobria o terceiro problema.
 */
function esquemaDoModo(editando: boolean) {
  if (editando) return esquema;
  return esquema.extend({
    senha: senhaValida,
  });
}

export function ClienteFormPage() {
  const { id } = useParams();
  const clienteId = id ? Number(id) : undefined;
  const editando = Boolean(clienteId);

  const navegar = useNavigate();
  const queryClient = useQueryClient();
  const [foto, setFoto] = useState<File | null>(null);

  const { data: estados } = useQuery({
    queryKey: chaves.estados,
    queryFn: estadosApi.listar,
    staleTime: Infinity,
  });

  const { data: cliente, isLoading } = useQuery({
    queryKey: chaves.cliente(clienteId!),
    queryFn: () => clientesApi.buscar(clienteId!),
    enabled: editando,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>({
    resolver: zodResolver(esquemaDoModo(editando)),
    defaultValues: { tipoPessoa: 'JURIDICA' },
  });

  /*
   * Formata enquanto digita. Vai por `setValue` e não por `register(…, {
   * onChange })` porque o valor precisa estar mascarado ANTES de o react-hook-
   * form guardá-lo — é ele que vai para o payload, e o servidor grava o que
   * chegar. Mascarar só na exibição deixaria o banco com os dois formatos.
   */
  const aoDigitar =
    (campo: 'cpf' | 'cnpj' | 'telefone' | 'cep', mascara: (v: string) => string) =>
    (evento: ChangeEvent<HTMLInputElement>) =>
      setValue(campo, mascara(evento.target.value), { shouldDirty: true });

  /* Preenchimento por CEP. `definir` e `valorAtual` estreitam o setValue/
     getValues do react-hook-form para os campos de endereço — o hook serve os
     dois formulários, que têm esquemas diferentes e o mesmo endereço. */
  const { consultar: consultarCep, consultando: consultandoCep } = usePreencherPorCep({
    definir: (campo, valor) => setValue(campo, valor, { shouldDirty: true }),
    valorAtual: (campo) => getValues(campo),
    estados,
  });

  useEffect(() => {
    if (!cliente) return;

    reset({
      nome: cliente.nome,
      email: cliente.email,
      senha: '',
      tipoPessoa: cliente.tipoPessoa,
      cpf: cliente.cpf ?? '',
      cnpj: cliente.cnpj ?? '',
      dataNascimento: paraInputDate(cliente.dataNascimento),
      telefone: cliente.telefone ?? '',
      cep: cliente.cep ?? '',
      endereco: cliente.endereco ?? '',
      bairro: cliente.bairro ?? '',
      cidade: cliente.cidade ?? '',
      estadoId: cliente.estadoId ? String(cliente.estadoId) : '',
    });
  }, [cliente, reset]);

  const salvar = useMutation({
    mutationFn: async (formulario: Formulario) => {
      const dados: DadosCliente = {
        nome: formulario.nome,
        email: formulario.email,
        tipoPessoa: formulario.tipoPessoa,
        cpf: formulario.cpf || undefined,
        cnpj: formulario.cnpj || undefined,
        dataNascimento: formulario.dataNascimento || undefined,
        telefone: formulario.telefone || undefined,
        cep: formulario.cep || undefined,
        endereco: formulario.endereco || undefined,
        bairro: formulario.bairro || undefined,
        cidade: formulario.cidade || undefined,
        estadoId: formulario.estadoId ? Number(formulario.estadoId) : undefined,
        // A senha só é enviada quando preenchida (mesma regra do legado).
        ...(formulario.senha ? { senha: formulario.senha } : {}),
      };

      const registro = editando
        ? await clientesApi.atualizar(clienteId!, dados)
        : await clientesApi.criar(dados as DadosCliente);

      if (foto) {
        await clientesApi.enviarFoto(registro.id, foto);
      }

      return registro;
    },
    onSuccess: () => {
      toast.success(editando ? 'Cliente atualizado.' : 'Cliente cadastrado.');
      void queryClient.invalidateQueries({ queryKey: ['clientes'] });
      navegar('/clientes');
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  if (editando && isLoading) return <Carregando />;

  const pessoaJuridica = watch('tipoPessoa') === 'JURIDICA';

  return (
    <>
      <CabecalhoPagina
        titulo={editando ? 'Editar cliente' : 'Novo cliente'}
        descricao={
          editando
            ? 'Deixe a senha em branco para mantê-la inalterada.'
            : 'Os campos marcados com * são obrigatórios.'
        }
        acoes={
          <Link to="/clientes" className="btn">
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
          <legend>Identificação</legend>
          <div className="form-grade">
            <Campo label="Nome / Razão social" erro={errors.nome?.message} obrigatorio>
              <input type="text" {...register('nome')} />
            </Campo>

            <Campo label="E-mail (login)" erro={errors.email?.message} obrigatorio>
              <input type="email" autoComplete="off" {...register('email')} />
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
              <CampoSenha autoComplete="new-password" {...register('senha')} />
            </Campo>

            <Campo label="Tipo de pessoa">
              <select {...register('tipoPessoa')}>
                <option value="JURIDICA">Jurídica</option>
                <option value="FISICA">Física</option>
              </select>
            </Campo>

            {pessoaJuridica ? (
              <Campo label="CNPJ" erro={errors.cnpj?.message}>
                <input
                  type="text"
                  placeholder="00.000.000/0000-00"
                  inputMode="numeric"
                  {...register('cnpj')}
                  onChange={aoDigitar('cnpj', mascararCnpj)}
                />
              </Campo>
            ) : (
              <>
                <Campo label="CPF" erro={errors.cpf?.message}>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    {...register('cpf')}
                    onChange={aoDigitar('cpf', mascararCpf)}
                  />
                </Campo>
                <Campo label="Data de nascimento">
                  <input type="date" {...register('dataNascimento')} />
                </Campo>
              </>
            )}

            <Campo label="Telefone">
              <input
                type="tel"
                placeholder="(11) 90000-0000"
                inputMode="numeric"
                {...register('telefone')}
                onChange={aoDigitar('telefone', mascararTelefone)}
              />
            </Campo>
          </div>
        </fieldset>

        <fieldset className="secao-form">
          <legend>Endereço</legend>
          <div className="form-grade">
            <Campo
              label={consultandoCep ? 'CEP (buscando…)' : 'CEP'}
              erro={errors.cep?.message}
            >
              <input
                type="text"
                placeholder="00000-000"
                inputMode="numeric"
                {...register('cep')}
                onChange={(evento) => {
                  aoDigitar('cep', mascararCep)(evento);
                  void consultarCep(evento.target.value);
                }}
              />
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
            {cliente?.fotoUrl && (
              <img className="avatar" src={urlArquivo(cliente.fotoUrl)} alt="Foto atual" />
            )}
            <CampoArquivo
              rotulo="Enviar imagem"
              dica="JPG, PNG ou WebP. Imagens grandes são reduzidas automaticamente."
              aceita="image/jpeg,image/png,image/webp"
              aoEscolher={setFoto}
            />
          </div>
        </fieldset>

        <div className="form-acoes">
          <Link to="/clientes" className="btn">
            Cancelar
          </Link>
          <button
            type="submit"
            className="btn btn--primario"
            disabled={isSubmitting || salvar.isPending}
          >
            {salvar.isPending ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </>
  );
}
