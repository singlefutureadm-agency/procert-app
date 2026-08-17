import { useRef, useState } from 'react';

/**
 * Envio de logo e papel de parede.
 *
 * O upload é imediato e independente do formulário de tokens: sobe, o servidor
 * responde a configuração já atualizada e o painel reflete na hora. Amarrá-lo
 * ao botão Salvar exigiria segurar o arquivo em memória e reenviar tudo junto,
 * sem ganho — a imagem não tem estado intermediário para revisar.
 *
 * Por isso o aviso: aqui não existe "descartar".
 */

interface Props {
  rotulo: string;
  descricao: string;
  url: string | null;
  /** Fundo do quadro de amostra: logo pede contraste, wallpaper não. */
  amostraContida?: boolean;
  enviando: boolean;
  aoEnviar: (arquivo: File) => void;
  aoRemover: () => void;
}

export function CampoImagem({
  rotulo,
  descricao,
  url,
  amostraContida = true,
  enviando,
  aoEnviar,
  aoRemover,
}: Props) {
  const entrada = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);

  const selecionar = (arquivo?: File) => {
    if (!arquivo) return;

    // O servidor valida de novo; isto só evita a viagem quando dá para saber antes.
    if (!/^image\/(png|jpeg|webp|gif)$/.test(arquivo.type)) {
      setErro('Formato não aceito. Use PNG, JPG, WebP ou GIF.');
      return;
    }
    setErro(null);
    aoEnviar(arquivo);
  };

  return (
    <div className="campo">
      <label>{rotulo}</label>
      <span className="texto-pequeno texto-fraco">{descricao}</span>

      <div className="campo-imagem">
        <div
          className={`campo-imagem__amostra ${
            amostraContida ? 'campo-imagem__amostra--contida' : ''
          }`}
        >
          {url ? (
            <img src={url} alt={`Pré-visualização: ${rotulo}`} />
          ) : (
            <span className="texto-fraco texto-pequeno">Nenhuma imagem</span>
          )}
        </div>

        <div className="campo-imagem__acoes">
          <input
            ref={entrada}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(e) => {
              selecionar(e.target.files?.[0]);
              // Permite reenviar o mesmo arquivo depois de remover.
              e.target.value = '';
            }}
          />

          <button
            type="button"
            className="btn btn--pequeno"
            onClick={() => entrada.current?.click()}
            disabled={enviando}
          >
            {enviando ? 'Enviando...' : url ? 'Substituir' : 'Enviar imagem'}
          </button>

          {url && (
            <button
              type="button"
              className="btn btn--pequeno btn--perigo"
              onClick={aoRemover}
              disabled={enviando}
            >
              Remover
            </button>
          )}
        </div>
      </div>

      {erro && (
        <span className="campo__erro" role="alert">
          {erro}
        </span>
      )}
    </div>
  );
}
