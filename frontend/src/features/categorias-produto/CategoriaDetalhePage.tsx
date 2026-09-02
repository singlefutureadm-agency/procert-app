import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { Campo } from '@/components/Campo';
import { Carregando } from '@/components/Carregando';
import { EstadoVazio } from '@/components/EstadoVazio';
import { Icone } from '@/components/Icone';
import { ModalConfirmacao } from '@/components/ModalConfirmacao';
import { trilhasApi } from '@/features/trilhas/api';
import { mensagemDeErro } from '@/lib/api';
import { chaves } from '@/lib/queryClient';
import { categoriasApi } from './api';

/**
 * Detalhe da categoria: qual trilha do catálogo ela segue.
 *
 * Esta tela EDITAVA a trilha da categoria, porque a trilha pertencia a ela.
 * Hoje a trilha é catálogo, reutilizável, e as etapas se editam em
 * `/trilhas/:id` — aqui se escolhe qual processo a categoria adota. Manter a
 * edição de etapas nos dois lugares faria parecer que o ajuste vale só para
 * esta categoria, quando ele muda o processo de todas que seguem a trilha.
 */
export function CategoriaDetalhePage() {
  const { id } = useParams();
  const categoriaId = Number(id);
  const queryClient = useQueryClient();

  const [escolhida, setEscolhida] = useState<string>('');
  const [confirmarTroca, setConfirmarTroca] = useState(false);

  const categoria = useQuery({
    queryKey: chaves.categoria(categoriaId),
    queryFn: () => categoriasApi.buscarPorId(categoriaId),
    enabled: Number.isFinite(categoriaId),
  });

  const trilhas = useQuery({
    queryKey: chaves.trilhasResumo,
    queryFn: () => trilhasApi.resumo(),
  });

  useEffect(() => {
    setEscolhida(
      categoria.data?.trilhaId ? String(categoria.data.trilhaId) : '',
    );
  }, [categoria.data?.trilhaId]);

  const vincular = useMutation({
    mutationFn: (trilhaId: number | null) =>
      categoriasApi.vincularTrilha(categoriaId, trilhaId),
    onSuccess: (atualizada) => {
      toast.success(
        atualizada.trilha
          ? `Categoria vinculada à trilha "${atualizada.trilha.nome}".`
          : 'Trilha desvinculada. A categoria deixou de aceitar produtos novos.',
      );
      void queryClient.invalidateQueries({ queryKey: ['categorias'] });
      // O contador de categorias da trilha muda dos dois lados do vínculo.
      void queryClient.invalidateQueries({ queryKey: ['trilhas'] });
      setConfirmarTroca(false);
    },
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  if (categoria.isLoading) return <Carregando />;

  if (categoria.isError || !categoria.data) {
    return (
      <EstadoVazio
        icone="pastas"
        titulo="Categoria não encontrada"
        acao={
          <Link to="/categorias" className="btn btn--primario">
            Voltar
          </Link>
        }
      />
    );
  }

  const dados = categoria.data;
  const trilhaAtual = dados.trilha;
  const alterada = escolhida !== (dados.trilhaId ? String(dados.trilhaId) : '');
  const trilhaEscolhida = trilhas.data?.find(
    (trilha) => String(trilha.id) === escolhida,
  );

  return (
    <>
      <CabecalhoPagina
        titulo={dados.nome}
        descricao={
          dados.normaReferencia
            ? `Norma de referência: ${dados.normaReferencia}`
            : 'Trilha de certificação seguida por esta categoria.'
        }
        acoes={
          <>
            <Link to="/categorias" className="btn">
              <Icone nome="seta-esquerda" tamanho={16} />
              Categorias
            </Link>
            {trilhaAtual && (
              <Link to={`/trilhas/${trilhaAtual.id}`} className="btn btn--primario">
                <Icone nome="bussola" tamanho={16} />
                Ver etapas da trilha
              </Link>
            )}
          </>
        }
      />

      <section className="vidro" style={{ marginBottom: 16 }}>
        <h3 className="titulo-bloco" style={{ marginTop: 0 }}>
          Trilha de certificação
        </h3>

        {trilhaAtual ? (
          <p className="texto-pequeno texto-fraco" style={{ marginTop: 4 }}>
            Esta categoria segue a trilha{' '}
            <Link to={`/trilhas/${trilhaAtual.id}`}>
              <strong>{trilhaAtual.nome}</strong>
            </Link>
            {dados.modeloVigente ? (
              <>
                , na versão <strong>v{dados.modeloVigente.versao}</strong> com{' '}
                {dados.modeloVigente.totalEtapas} etapa(s).
              </>
            ) : (
              // Trilha vinculada mas sem versão vigente: a categoria parece
              // configurada e recusa todo produto novo.
              <> — que está sem versão vigente e por isso não aceita produtos.</>
            )}
          </p>
        ) : (
          <p className="texto-pequeno texto-fraco" style={{ marginTop: 4 }}>
            Esta categoria ainda não tem trilha. Sem trilha ela não aceita
            produtos: escolha uma do catálogo abaixo.
          </p>
        )}

        <div style={{ maxWidth: 520, marginTop: 12 }}>
          <Campo
            label="Trilha do catálogo"
            dica="Trilhas sem versão vigente não aparecem como opção — publique uma versão delas primeiro."
          >
            <select
              value={escolhida}
              onChange={(evento) => setEscolhida(evento.target.value)}
              disabled={trilhas.isLoading}
            >
              <option value="">— Sem trilha —</option>
              {trilhas.data
                ?.filter((trilha) => trilha.modeloVigente)
                .map((trilha) => (
                  <option key={trilha.id} value={trilha.id}>
                    {trilha.nome} · v{trilha.modeloVigente!.versao} ·{' '}
                    {trilha.modeloVigente!.totalEtapas} etapa(s)
                  </option>
                ))}
            </select>
          </Campo>
        </div>

        <div className="form-acoes" style={{ justifyContent: 'flex-start' }}>
          <button
            type="button"
            className="btn btn--primario"
            disabled={!alterada || vincular.isPending}
            onClick={() => {
              // Trocar a trilha de uma categoria com produtos muda a régua dos
              // FUTUROS. Vale um aviso explícito: o efeito não é visível na
              // tela em que a ação acontece.
              if (dados.totalProdutos > 0) {
                setConfirmarTroca(true);
              } else {
                vincular.mutate(escolhida ? Number(escolhida) : null);
              }
            }}
          >
            {vincular.isPending ? 'Salvando...' : 'Salvar vínculo'}
          </button>
          {alterada && (
            <button
              type="button"
              className="btn"
              onClick={() =>
                setEscolhida(dados.trilhaId ? String(dados.trilhaId) : '')
              }
            >
              Desfazer
            </button>
          )}
        </div>

        {trilhas.data?.filter((trilha) => trilha.modeloVigente).length === 0 && (
          <p className="texto-pequeno texto-fraco">
            Nenhuma trilha do catálogo tem versão vigente ainda.{' '}
            <Link to="/trilhas">Crie uma trilha</Link> para poder vincular.
          </p>
        )}
      </section>

      <section className="vidro">
        <h3 className="titulo-bloco" style={{ marginTop: 0 }}>
          Resumo
        </h3>
        <dl className="lista-dados">
          <div>
            <dt className="texto-pequeno texto-fraco">Produtos nesta categoria</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{dados.totalProdutos}</dd>
          </div>
          <div>
            <dt className="texto-pequeno texto-fraco">Validade do certificado</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>
              {dados.validadeMeses} meses
            </dd>
          </div>
          <div>
            <dt className="texto-pequeno texto-fraco">Versões da trilha</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{dados.totalVersoes}</dd>
          </div>
        </dl>
      </section>

      <ModalConfirmacao
        aberto={confirmarTroca}
        titulo={escolhida ? 'Trocar a trilha da categoria' : 'Desvincular a trilha'}
        mensagem={
          escolhida
            ? `Esta categoria tem ${dados.totalProdutos} produto(s). Passar a seguir "${trilhaEscolhida?.nome}" vale só para produtos NOVOS — os que já estão em avaliação continuam na versão pela qual entraram.`
            : `Esta categoria tem ${dados.totalProdutos} produto(s). Sem trilha ela deixa de aceitar produtos novos; os em avaliação não são afetados.`
        }
        rotuloConfirmar={escolhida ? 'Trocar trilha' : 'Desvincular'}
        perigo={!escolhida}
        carregando={vincular.isPending}
        aoCancelar={() => setConfirmarTroca(false)}
        aoConfirmar={() => vincular.mutate(escolhida ? Number(escolhida) : null)}
      />
    </>
  );
}
