import { useId } from 'react';

import { Icone } from '@/components/Icone';
import { formatarPrazoSla } from '@/lib/formatadores';
import { ROTULO_PAPEL_FUNCIONAL } from './rotulos';
import type { MicroEtapaEntrada, PapelFuncional } from '@/types';

/**
 * CRUD do checklist de uma etapa, dentro do modal da etapa.
 *
 * Cada item tem **área responsável e prazo próprios** porque uma etapa cruza
 * áreas na prática: no ensaio, receber a amostra é da Qualidade e executar é do
 * Técnico. Com um responsável só na etapa, essa divisão não caberia no sistema.
 *
 * Não é formulário aninhado nem `useFieldArray`: o estado é uma lista simples
 * que o modal já controla, e as operações são acrescentar, editar em linha,
 * mover e remover. Um sub-form traria validação e submit próprios para algo que
 * é salvo junto com a etapa, nunca sozinho.
 */
export function EditorMicroEtapas({
  itens,
  aoMudar,
}: {
  itens: MicroEtapaEntrada[];
  aoMudar: (itens: MicroEtapaEntrada[]) => void;
}) {
  const id = useId();

  function alterar(indice: number, campo: Partial<MicroEtapaEntrada>) {
    aoMudar(itens.map((item, i) => (i === indice ? { ...item, ...campo } : item)));
  }

  function remover(indice: number) {
    aoMudar(itens.filter((_, i) => i !== indice));
  }

  /** Move um item uma posição. A ordem final é a posição na lista. */
  function mover(indice: number, direcao: -1 | 1) {
    const destino = indice + direcao;
    if (destino < 0 || destino >= itens.length) return;

    const copia = [...itens];
    [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
    aoMudar(copia);
  }

  return (
    <fieldset className="micro-editor">
      <legend>Microetapas (checklist)</legend>
      <p className="texto-pequeno texto-fraco micro-editor__dica">
        Cada processo recebe uma cópia própria desta lista ao entrar na trilha, e
        é a cópia que a equipe marca. Área e prazo em branco seguem os da etapa.
      </p>

      {itens.length === 0 && (
        <p className="texto-pequeno texto-fraco micro-editor__vazio">
          Sem checklist. A etapa é avaliada direto, sem itens a marcar.
        </p>
      )}

      <ol className="micro-editor__lista">
        {itens.map((item, indice) => (
          <li key={indice} className="micro-editor__item">
            <span className="micro-editor__ordem" aria-hidden>
              {indice + 1}
            </span>

            <div className="micro-editor__campos">
              <label className="apenas-leitor-tela" htmlFor={`${id}-nome-${indice}`}>
                Nome da microetapa {indice + 1}
              </label>
              <input
                id={`${id}-nome-${indice}`}
                type="text"
                value={item.nome}
                placeholder="O que precisa ser feito"
                maxLength={200}
                onChange={(evento) => alterar(indice, { nome: evento.target.value })}
              />

              <label className="apenas-leitor-tela" htmlFor={`${id}-area-${indice}`}>
                Área responsável da microetapa {indice + 1}
              </label>
              <select
                id={`${id}-area-${indice}`}
                value={item.papelResponsavel ?? ''}
                onChange={(evento) =>
                  alterar(indice, {
                    papelResponsavel:
                      (evento.target.value || undefined) as PapelFuncional | undefined,
                  })
                }
              >
                <option value="">Área da etapa</option>
                {(Object.keys(ROTULO_PAPEL_FUNCIONAL) as PapelFuncional[]).map(
                  (papel) => (
                    <option key={papel} value={papel}>
                      {ROTULO_PAPEL_FUNCIONAL[papel]}
                    </option>
                  ),
                )}
              </select>

              <label className="apenas-leitor-tela" htmlFor={`${id}-prazo-${indice}`}>
                Prazo em horas da microetapa {indice + 1}
              </label>
              <input
                id={`${id}-prazo-${indice}`}
                type="number"
                min={1}
                max={8760}
                value={item.prazoSlaHoras ?? ''}
                placeholder="Horas"
                title={
                  item.prazoSlaHoras
                    ? `Equivale a ${formatarPrazoSla(item.prazoSlaHoras)}`
                    : 'Prazo em horas deste item'
                }
                onChange={(evento) =>
                  alterar(indice, {
                    // Campo vazio é "sem prazo próprio", não zero.
                    prazoSlaHoras: evento.target.value
                      ? Number(evento.target.value)
                      : undefined,
                  })
                }
              />
            </div>

            <div className="micro-editor__acoes">
              <button
                type="button"
                className="btn btn--icone btn--secundario"
                aria-label={`Mover a microetapa ${indice + 1} para cima`}
                disabled={indice === 0}
                onClick={() => mover(indice, -1)}
              >
                <Icone nome="seta-esquerda" />
              </button>
              <button
                type="button"
                className="btn btn--icone btn--secundario"
                aria-label={`Mover a microetapa ${indice + 1} para baixo`}
                disabled={indice === itens.length - 1}
                onClick={() => mover(indice, 1)}
              >
                <Icone nome="seta-direita" />
              </button>
              <button
                type="button"
                className="btn btn--icone btn--perigo"
                aria-label={`Remover a microetapa ${indice + 1}`}
                onClick={() => remover(indice)}
              >
                <Icone nome="lixeira" />
              </button>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        className="btn btn--secundario micro-editor__adicionar"
        onClick={() => aoMudar([...itens, { nome: '' }])}
      >
        + Microetapa
      </button>
    </fieldset>
  );
}
