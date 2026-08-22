import { useId, useRef, useState } from 'react';

interface Props {
  rotulo: string;
  dica?: string;
  /** Mesmo formato do atributo `accept` do input. */
  aceita: string;
  aoEscolher: (arquivo: File | null) => void;
}

/**
 * Seletor de arquivo com botão próprio.
 *
 * O `<input type="file">` cru desenha o botão e o texto "nenhum arquivo
 * selecionado" com legendas do NAVEGADOR, no idioma dele — num Chrome
 * configurado em pt-PT o painel inteiro em pt-BR exibia *"Escolher ficheiro /
 * Nenhum ficheiro selecionado"* no meio do formulário. Também não há como
 * estilizá-lo: ele ignora os tokens de tema.
 *
 * A saída é a mesma que `features/aparencia/CampoImagem` já usava: o input fica
 * `hidden` e um `<button>` normal dispara o seletor. O nome do arquivo passa a
 * ser texto nosso, e o `aria-describedby` liga o botão a ele — senão o leitor
 * de tela anuncia "Escolher arquivo" sem dizer qual está escolhido.
 */
export function CampoArquivo({ rotulo, dica, aceita, aoEscolher }: Props) {
  const entrada = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState<string | null>(null);
  const id = useId();
  const idEstado = `${id}-estado`;

  return (
    <div className="campo">
      <span className="campo__rotulo">{rotulo}</span>

      <div className="campo-arquivo">
        <input
          ref={entrada}
          type="file"
          accept={aceita}
          hidden
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0] ?? null;
            setNome(arquivo?.name ?? null);
            aoEscolher(arquivo);
            // Permite reescolher o mesmo arquivo depois de remover.
            evento.target.value = '';
          }}
        />

        <button
          type="button"
          className="btn btn--pequeno"
          aria-describedby={idEstado}
          onClick={() => entrada.current?.click()}
        >
          {nome ? 'Trocar arquivo' : 'Escolher arquivo'}
        </button>

        <span className="texto-pequeno texto-suave campo-arquivo__nome" id={idEstado}>
          {nome ?? 'Nenhum arquivo escolhido'}
        </span>

        {nome && (
          <button
            type="button"
            className="btn btn--pequeno"
            onClick={() => {
              setNome(null);
              aoEscolher(null);
            }}
          >
            Remover
          </button>
        )}
      </div>

      {dica && <span className="texto-pequeno texto-fraco">{dica}</span>}
    </div>
  );
}
