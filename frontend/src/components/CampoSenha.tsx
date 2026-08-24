import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';

import { Icone } from './Icone';

/**
 * Campo de senha com alternância de visibilidade.
 *
 * Digitar senha às cegas é a principal causa de erro de login em teclado de
 * celular, onde maiúscula e símbolo exigem trocar de camada — e no cadastro o
 * problema é pior: um deslize vira uma senha que ninguém sabe qual é.
 *
 * `forwardRef` porque o `register` do react-hook-form entrega uma `ref`, e sem
 * repassá-la ao `<input>` real o formulário não lê o valor.
 *
 * Detalhes que não são enfeite:
 *
 * - **`type="button"`** no alternador. Dentro de um `<form>`, o padrão de um
 *   botão é `submit`: sem isso, revelar a senha enviaria o formulário.
 * - **`aria-label` que muda com o estado**, e não `aria-pressed` num ícone
 *   mudo. O leitor de tela anuncia a ação disponível, que é o que interessa.
 * - **Aviso quando a senha está à mostra**, em região viva discreta: quem não
 *   enxerga a tela não tem como saber que a senha está legível para quem está
 *   ao lado.
 * - **O estado volta a oculto sozinho?** Não. Seria surpreendente perder a
 *   revelação no meio da digitação; quem revelou decide quando esconder.
 */
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const CampoSenha = forwardRef<HTMLInputElement, Props>(function CampoSenha(
  props,
  ref,
) {
  const [visivel, setVisivel] = useState(false);
  const idAviso = useId();

  return (
    <div className="campo-senha">
      <input
        {...props}
        ref={ref}
        type={visivel ? 'text' : 'password'}
        className={`campo-senha__entrada ${props.className ?? ''}`.trim()}
        aria-describedby={
          [props['aria-describedby'], visivel ? idAviso : null].filter(Boolean).join(' ') ||
          undefined
        }
      />

      <button
        type="button"
        className="campo-senha__alternar"
        aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
        onClick={() => setVisivel((atual) => !atual)}
      >
        <Icone nome={visivel ? 'olho-fechado' : 'olho'} />
      </button>

      <span className="apenas-leitor-tela" id={idAviso} role="status">
        {visivel ? 'A senha está visível na tela.' : ''}
      </span>
    </div>
  );
});
