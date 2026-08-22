import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

interface Props {
  label: string;
  erro?: string;
  obrigatorio?: boolean;
  dica?: string;
  children: ReactNode;
}

/**
 * Envelope padrão de um campo de formulário: rótulo, controle, erro e dica.
 *
 * O rótulo era um `<label>` sem `htmlFor` ao lado de um controle sem `id` — ou
 * seja, órfão. Três coisas quebravam com isso, em TODO formulário do painel:
 *
 * - O leitor de tela anunciava "caixa de texto" sem dizer qual.
 * - Clicar no rótulo não focava o campo (comportamento nativo do `<label>`).
 * - A mensagem de erro tinha `role="alert"`, mas não estava ligada ao campo:
 *   quem navegava por Tab até o input não ouvia o motivo do erro.
 *
 * A associação é feita clonando o filho para injetar `id`, `aria-describedby` e
 * `aria-invalid`. Todos os usos passam um único `<input>`, `<select>` ou
 * `<textarea>`; o `isValidElement` cobre o caso de alguém passar outra coisa —
 * aí o campo continua renderizando, só sem a associação.
 */
export function Campo({ label, erro, obrigatorio, dica, children }: Props) {
  const id = useId();
  const idControle = `${id}-controle`;
  const idDica = `${id}-dica`;
  const idErro = `${id}-erro`;

  // A dica some quando há erro (a mensagem ocupa o lugar dela), então só um dos
  // dois entra em `aria-describedby` — descrever um elemento que não está no
  // DOM deixa o leitor de tela sem nada para ler.
  const descricao = erro ? idErro : dica ? idDica : undefined;

  const controle = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        // Um `id` já definido no ponto de uso continua valendo: ele pode estar
        // referenciado em outro lugar.
        id: (children.props as { id?: string }).id ?? idControle,
        'aria-describedby': descricao,
        'aria-invalid': erro ? true : undefined,
      })
    : children;

  const alvoDoRotulo = isValidElement(children)
    ? ((children.props as { id?: string }).id ?? idControle)
    : undefined;

  return (
    <div className={`campo ${erro ? 'campo--invalido' : ''}`}>
      <label htmlFor={alvoDoRotulo}>
        {label}
        {obrigatorio && (
          <span aria-hidden className="campo__obrigatorio">
            {' *'}
          </span>
        )}
      </label>
      {controle}
      {dica && !erro && (
        <span className="texto-pequeno texto-fraco" id={idDica}>
          {dica}
        </span>
      )}
      {erro && (
        <span className="campo__erro" role="alert" id={idErro}>
          {erro}
        </span>
      )}
    </div>
  );
}
