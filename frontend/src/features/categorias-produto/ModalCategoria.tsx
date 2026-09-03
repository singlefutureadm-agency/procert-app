import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Campo } from '@/components/Campo';
import { mensagemDeErro } from '@/lib/api';
import type { CategoriaProduto } from '@/types';
import { categoriasApi } from './api';

const esquema = z.object({
  nome: z.string().trim().min(3, 'Informe o nome da categoria.').max(120),
  descricao: z.string().trim().max(2000).optional(),
  normaReferencia: z.string().trim().max(200).optional(),
  validadeMeses: z.coerce
    .number()
    .int()
    .min(1, 'Informe ao menos 1 mês.')
    .max(600),
});

type Formulario = z.infer<typeof esquema>;

interface Props {
  aberto: boolean;
  categoria: CategoriaProduto | null;
  aoFechar: () => void;
}

export function ModalCategoria({ aberto, categoria, aoFechar }: Props) {
  const queryClient = useQueryClient();
  const editando = Boolean(categoria);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Formulario>({ resolver: zodResolver(esquema) });

  useEffect(() => {
    reset({
      nome: categoria?.nome ?? '',
      descricao: categoria?.descricao ?? '',
      normaReferencia: categoria?.normaReferencia ?? '',
      validadeMeses: categoria?.validadeMeses ?? 24,
    });
  }, [categoria, aberto, reset]);

  const salvar = useMutation({
    mutationFn: (dados: Formulario) =>
      editando
        ? categoriasApi.atualizar(categoria!.id, dados)
        : categoriasApi.criar(dados),
    onSuccess: () => {
      toast.success(editando ? 'Categoria atualizada.' : 'Categoria cadastrada.');
      void queryClient.invalidateQueries({ queryKey: ['categorias'] });
      aoFechar();
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  if (!aberto) return null;

  return (
    <div
      className="modal-fundo"
      role="dialog"
      aria-modal="true"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <form
        className="modal vidro"
        onSubmit={handleSubmit((dados) => salvar.mutate(dados))}
        noValidate
      >
        <h3>{editando ? 'Editar categoria' : 'Nova categoria'}</h3>

        <Campo label="Nome" erro={errors.nome?.message} obrigatorio>
          <input
            type="text"
            autoFocus
            placeholder="EPIs para trabalho em altura"
            {...register('nome')}
          />
        </Campo>

        <Campo
          label="Norma de referência"
          erro={errors.normaReferencia?.message}
          dica="Norma técnica que rege a certificação desta família de produtos."
        >
          <input type="text" placeholder="ABNT NBR 15836" {...register('normaReferencia')} />
        </Campo>

        <Campo
          label="Validade do certificado (meses)"
          erro={errors.validadeMeses?.message}
          obrigatorio
          dica="Usada para calcular o vencimento do certificado emitido nesta categoria."
        >
          <input type="number" min={1} max={600} {...register('validadeMeses')} />
        </Campo>

        <Campo label="Descrição" erro={errors.descricao?.message}>
          <textarea rows={3} {...register('descricao')} />
        </Campo>

        {!editando && (
          <p className="texto-pequeno texto-fraco">
            Depois de criar a categoria, vincule a ela uma trilha do catálogo —
            sem trilha vinculada, a categoria não aceita produtos.
          </p>
        )}

        <div className="form-acoes">
          <button type="button" className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primario" disabled={salvar.isPending}>
            {salvar.isPending ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}
