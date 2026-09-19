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
import { categoriasApi } from '@/features/categorias-processo/api';
import { modelosTrilhaApi } from '@/features/trilhas/api';
import { ROTULO_TIPO_ETAPA } from '@/features/trilhas/rotulos';
import { clientesApi } from '@/features/clientes/api';
import { mensagemDeErro, urlArquivo } from '@/lib/api';
import { formatarPrazoSla } from '@/lib/formatadores';
import { chaves } from '@/lib/queryClient';
import { processosApi, type DadosProcesso } from './api';

const esquema = z.object({
  clienteId: z.string().min(1, 'Selecione o cliente.'),
  categoriaId: z.string().min(1, 'Selecione a categoria.'),
  nome: z.string().min(3, 'Informe o nome do processo.'),
  descricao: z.string().optional(),
  preco: z.string().optional(),
});

type Formulario = z.infer<typeof esquema>;

export function ProcessoFormPage() {
  const { id } = useParams();
  const processoId = id ? Number(id) : undefined;
  const editando = Boolean(processoId);

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

  const { data: processo, isLoading } = useQuery({
    queryKey: chaves.processo(processoId!),
    queryFn: () => processosApi.buscar(processoId!),
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

  /*
   * Preview da trilha: as etapas vêm da versão vigente da TRILHA vinculada à
   * categoria escolhida — não mais da categoria, que hoje só aponta para ela.
   */
  const trilhaDaCategoria = categoriaSelecionada?.trilha;
  const { data: versoes } = useQuery({
    queryKey: chaves.modelosTrilha(trilhaDaCategoria?.id ?? 0),
    queryFn: () => modelosTrilhaApi.listarPorTrilha(trilhaDaCategoria!.id),
    enabled: Boolean(trilhaDaCategoria && categoriaSelecionada?.modeloVigente),
  });

  const trilhaVigente = versoes?.find((versao) => versao.ativo);

  useEffect(() => {
    if (!processo) return;

    reset({
      clienteId: String(processo.clienteId),
      categoriaId: String(processo.categoriaId),
      nome: processo.nome,
      descricao: processo.descricao ?? '',
      preco: String(processo.preco ?? 0),
    });
  }, [processo, reset]);

  const salvar = useMutation({
    mutationFn: async (formulario: Formulario) => {
      const dados: DadosProcesso = {
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
        ? await processosApi.atualizar(processoId!, dados)
        : await processosApi.criar({
            ...dados,
            categoriaId: Number(formulario.categoriaId),
          });

      if (foto) {
        await processosApi.enviarFoto(registro.id, foto);
      }

      return registro;
    },
    onSuccess: (registro) => {
      toast.success(
        editando
          ? 'Processo atualizado.'
          : 'Processo cadastrado e certificação iniciada.',
      );
      void queryClient.invalidateQueries({ queryKey: ['processos'] });
      void queryClient.invalidateQueries({ queryKey: ['certificacoes'] });
      navegar(editando ? '/processos' : `/certificacoes/processo/${registro.id}`);
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  if (editando && isLoading) return <Carregando />;

  return (
    <>
      <CabecalhoPagina
        titulo={editando ? 'Editar processo' : 'Novo processo'}
        descricao={
          editando
            ? 'A trilha de certificação já existente não é alterada aqui.'
            : 'Ao salvar, a certificação é aberta automaticamente com todas as etapas ativas.'
        }
        acoes={
          <Link to="/processos" className="btn">
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
          <legend>Dados do processo</legend>
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
                {editando && processo && (
                  <option value={processo.categoriaId}>{processo.categoria.nome}</option>
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

            <Campo label="Nome do processo" erro={errors.nome?.message} obrigatorio>
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
              Trilha que será aberta — {trilhaDaCategoria?.nome}, versão{' '}
              {trilhaVigente.versao}
            </legend>
            <p className="texto-pequeno texto-fraco" style={{ marginTop: 0 }}>
              {categoriaSelecionada?.normaReferencia
                ? `Norma de referência: ${categoriaSelecionada.normaReferencia}. `
                : ''}
              O processo fica vinculado a esta versão mesmo que a trilha receba
              versões novas depois, ou que a categoria passe a seguir outra trilha.
            </p>
            <ol className="lista-etapas">
              {trilhaVigente.etapas.map((etapa) => (
                <li key={etapa.id}>
                  <strong>{etapa.nome}</strong>{' '}
                  <span className="texto-pequeno texto-fraco">
                    {ROTULO_TIPO_ETAPA[etapa.tipo] ?? etapa.tipo}
                    {etapa.prazoSlaHoras
                      ? ` · ${formatarPrazoSla(etapa.prazoSlaHoras)}`
                      : ''}
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
            {processo?.fotoUrl && (
              <img
                className="avatar"
                src={urlArquivo(processo.fotoUrl)}
                alt="Imagem atual do processo"
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
          <Link to="/processos" className="btn">
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
