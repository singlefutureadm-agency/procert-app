import { useId, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { Icone } from '@/components/Icone';
import { Modal } from '@/components/Modal';
import { useAuth } from '@/auth/useAuth';

import { ajudaDaRota, resolverAjuda, type ConteudoAjuda } from './conteudo-ajuda';

interface Props {
  /**
   * Conteúdo explícito. Sem ele, o verbete é resolvido pela rota atual — que é
   * como o `CabecalhoPagina` usa, para que nenhuma tela precise se lembrar de
   * ligar a ajuda.
   */
  conteudo?: ConteudoAjuda;
}

/**
 * Botão "o que é esta tela?" e o modal que ele abre.
 *
 * Monta sobre o `Modal` em vez de desenhar o próprio diálogo: cortina, Escape,
 * Tab preso e devolução do foco à origem já estão resolvidos lá, cada um por
 * causa de um bug de foco que aconteceu de verdade. Uma segunda implementação
 * seria uma segunda chance de reintroduzir todos eles.
 *
 * Renderiza `null` quando a rota não tem verbete — assim o componente pode ser
 * fixo no cabeçalho de página sem que uma tela nova ganhe um botão que abre um
 * modal vazio. A cobertura é garantida pelo teste, não pela sorte.
 */
export function AjudaDaTela({ conteudo }: Props) {
  const { pathname } = useLocation();
  const { temPapel } = useAuth();
  const [aberto, setAberto] = useState(false);
  const idResumo = useId();

  const verbete = conteudo ?? ajudaDaRota(pathname);
  if (!verbete) return null;

  /*
   * Sete telas são compartilhadas entre a equipe e o cliente, e nelas os dois
   * estão fazendo coisas opostas: um avalia a não conformidade, o outro
   * responde a ela. Por isso a troca é do CONTEÚDO inteiro, e não um parágrafo
   * extra no fim — o corpo do texto precisa mudar de lado junto.
   */
  const ajuda = resolverAjuda(verbete, temPapel('CLIENTE'));

  return (
    <>
      <button
        type="button"
        className="btn btn--icone ajuda__gatilho"
        onClick={() => setAberto(true)}
        /*
         * O nome acessível vai no BOTÃO, não no ícone: `title` sozinho o leitor
         * de tela mal aproveita e no toque ele nunca aparece. O nome cita a
         * tela para que, numa lista de controles, "Ajuda" não se repita sem
         * contexto.
         */
        aria-label={`Ajuda sobre a tela ${ajuda.titulo}`}
        title="O que esta tela mostra?"
      >
        <Icone nome="interrogacao" tamanho={18} />
      </button>

      <Modal
        aberto={aberto}
        titulo={ajuda.titulo}
        largura="leitura"
        comBotaoFechar
        descritoPor={idResumo}
        aoFechar={() => setAberto(false)}
      >
        <div className="ajuda">
          <p className="ajuda__resumo" id={idResumo}>
            {ajuda.resumo}
          </p>

          <dl className="ajuda__topicos">
            {ajuda.topicos.map((topico) => (
              <div className="ajuda__topico" key={topico.titulo}>
                <dt>{topico.titulo}</dt>
                <dd>{topico.texto}</dd>
              </div>
            ))}
          </dl>

          {ajuda.proximoPasso && (
            <p className="ajuda__proximo">
              <Link
                to={ajuda.proximoPasso.para}
                className="btn btn--primario"
                onClick={() => setAberto(false)}
              >
                {ajuda.proximoPasso.texto}
                <Icone nome="seta-direita" tamanho={16} />
              </Link>
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
