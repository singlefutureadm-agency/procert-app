import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { Campo } from '@/components/Campo';
import { CampoArquivo } from '@/components/CampoArquivo';
import { Icone } from '@/components/Icone';
import { Carregando } from '@/components/Carregando';
import {
  categoriasApi,
  modelosTrilhaApi,
} from '@/features/categorias-produto/api';
import { ROTULO_TIPO_ETAPA } from '@/features/categorias-produto/rotulos';
import { clientesApi } from '@/features/clientes/api';
import { mensagemDeErro, urlArquivo } from '@/lib/api';
import { chaves } from '@/lib/queryClient';
import { produtosApi, type DadosProduto } from './api';

const esquema = z.object({
  clienteId: z.string().min(1, 'Selecione o cliente.'),
  categoriaId: z.string().min(1, 'Selecione a categoria.'),
  nome: z.string().min(3, 'Informe o nome do produto.'),
  descricao: z.string().optional(),
  preco: z.string().optional(),
});

type Formulario = z.infer<typeof esquema>;

export function ProdutoFormPage() {
  const { id } = useParams();
  const produtoId = id ? Number(id) : undefined;
  const editando = Boolean(produtoId);

  const navegar = useNavigate();
  const queryClient = useQueryClient();
  const [foto, setFoto] = useState<File | null>(null);

  const { data: clientes } = useQuery({
    queryKey: chaves.clientesResumo,
    queryFn: clientesApi.resumo,
  });

  const { data: categorias } = useQuery({
    queryKey: chaves.categoriasResumo,
    queryFn: categoriasApi.resumo,
    enabled: !editando,
  });

  const { data: produto, isLoading } = useQuery({
    queryKey: chaves.produto(produtoId!),
    queryFn: () => produtosApi.buscar(produtoId!),
    enabled: editando,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<Formulario>({ resolver: zodResolver(esquema) });

  const categoriaSelecionada = categorias?.find(
    (categoria) => String(categoria.id) === watch('categoriaId'),
  );

  // Preview da trilha: as etapas vêm da versão vigente da categoria escolhida.
  const { data: versoes } = useQuery({
    queryKey: chaves.modelosTrilha(categoriaSelecionada?.id ?? 0),
    queryFn: () => modelosTrilhaApi.listarPorCategoria(categoriaSelecionada!.id),
    enabled: Boolean(categoriaSelecionada?.modeloVigente),
  });

  const trilhaVigente = versoes?.find((versao) => versao.ativo);

  useEffect(() => {
    if (!produto) return;

    reset({
      clienteId: String(produto.clienteId),
      categoriaId: String(produto.categoriaId),
      nome: produto.nome,
      descricao: produto.descricao ?? '',
      preco: String(produto.preco ?? 0),
    });
  }, [produto, reset]);

  const salvar = useMutation({
    mutationFn: async (formulario: Formulario) => {
      const dados: DadosProduto = {
        clienteId: Number(formulario.clienteId),
        nome: formulario.nome,
        descricao: formulario.descricao || undefined,
        preco: formulario.preco
          ? Number(formulario.preco.replace(',', '.'))
          : 0,
      };

      // A categoria define a trilha e é imutável depois da submissão: o backend
      // recusa `categoriaId` na atualização.
      const registro = editando
        ? await produtosApi.atualizar(produtoId!, dados)
        : await produtosApi.criar({
            ...dados,
            categoriaId: Number(formulario.categoriaId),
          });

      if (foto) {
        await produtosApi.enviarFoto(registro.id, foto);
      }

      return registro;
    },
    onSuccess: (registro) => {
      toast.success(
        editando
          ? 'Produto atualizado.'
          : 'Produto cadastrado e certificação iniciada.',
      );
      void queryClient.invalidateQueries({ queryKey: ['produtos'] });
      void queryClient.invalidateQueries({ queryKey: ['certificacoes'] });
      navegar(editando ? '/produtos' : `/certificacoes/produto/${registro.id}`);
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  if (editando && isLoading) return <Carregando />;

  return (
    <>
      <CabecalhoPagina
        titulo={editando ? 'Editar produto' : 'Novo produto'}
        descricao={
          editando
            ? 'A trilha de certificação já existente não é alterada aqui.'
            : 'Ao salvar, a certificação é aberta automaticamente com todas as etapas ativas.'
        }
        acoes={
          <Link to="/produtos" className="btn">
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
          <legend>Dados do produto</legend>
          <div className="form-grade">
            <Campo label="Cliente" erro={errors.clienteId?.message} obrigatorio>
              <select {...register('clienteId')}>
                <option value="">Selecione...</option>
                {clientes?.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nome}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo
              label="Categoria"
              erro={errors.categoriaId?.message}
              obrigatorio
              dica={
                editando
                  ? 'A categoria não muda depois da submissão: ela define a trilha em avaliação.'
                  : 'Define a trilha de certificação que será aberta.'
              }
            >
              <select {...register('categoriaId')} disabled={editando}>
                <option value="">Selecione...</option>
                {editando && produto && (
                  <option value={produto.categoriaId}>{produto.categoria.nome}</option>
                )}
                {categorias?.map((categoria) => (
                  <option
                    key={categoria.id}
                    value={categoria.id}
                    // Sem trilha vigente o backend recusaria o cadastro.
                    disabled={!categoria.modeloVigente}
                  >
                    {categoria.nome}
                    {categoria.modeloVigente
                      ? ` (v${categoria.modeloVigente.versao})`
                      : ' — sem trilha'}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Nome do produto" erro={errors.nome?.message} obrigatorio>
              <input type="text" {...register('nome')} />
            </Campo>

            <Campo label="Valor do serviço (R$)" erro={errors.preco?.message}>
              <input type="text" inputMode="decimal" placeholder="0,00" {...register('preco')} />
            </Campo>
          </div>

          <div style={{ marginTop: 16 }}>
            <Campo label="Descrição técnica">
              <textarea rows={5} {...register('descricao')} />
            </Campo>
          </div>
        </fieldset>

        {!editando && trilhaVigente && (
          <fieldset className="secao-form">
            <legend>
              Trilha que será aberta — versão {trilhaVigente.versao}
            </legend>
            <p className="texto-pequeno texto-fraco" style={{ marginTop: 0 }}>
              {categoriaSelecionada?.normaReferencia
                ? `Norma de referência: ${categoriaSelecionada.normaReferencia}. `
                : ''}
              O produto fica vinculado a esta versão mesmo que a categoria receba
              versões novas depois.
            </p>
            <ol className="lista-etapas">
              {trilhaVigente.etapas.map((etapa) => (
                <li key={etapa.id}>
                  <strong>{etapa.nome}</strong>{' '}
                  <span className="texto-pequeno texto-fraco">
                    {ROTULO_TIPO_ETAPA[etapa.tipo] ?? etapa.tipo}
                    {etapa.prazoSlaDias ? ` · ${etapa.prazoSlaDias} dia(s)` : ''}
                    {etapa.obrigatoria ? '' : ' · opcional'}
                    {etapa.exigeDocumento ? ' · exige documento' : ''}
                  </span>
                </li>
              ))}
            </ol>
          </fieldset>
        )}

        <fieldset className="secao-form">
          <legend>Imagem</legend>
          <div className="linha-flex">
            {produto?.fotoUrl && (
              <img
                className="avatar"
                src={urlArquivo(produto.fotoUrl)}
                alt="Imagem atual do produto"
              />
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
          <Link to="/produtos" className="btn">
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
