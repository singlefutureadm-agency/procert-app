import { useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  formatarBytes,
  ImagemInvalidaError,
  PERFIL,
  prepararImagem,
  type OpcoesImagem,
} from '@/lib/imagem';
import type { ModoTema } from '@/types';

/**
 * Envio de logo e papel de parede.
 *
 * O upload é imediato e independente do formulário de tokens: sobe, o servidor
 * responde a configuração já atualizada e o painel reflete na hora. Amarrá-lo
 * ao botão Salvar exigiria segurar o arquivo em memória e reenviar tudo junto,
 * sem ganho — a imagem não tem estado intermediário para revisar.
 *
 * Por isso o aviso: aqui não existe "descartar".
 *
 * **O arquivo passa por `prepararImagem` antes de sair.** Este componente é
 * anterior a `lib/imagem.ts` e ficou de fora quando o resto do painel migrou
 * para `CampoArquivo` — era o único ponto em que uma imagem subia intacta, e
 * logo e papel de parede são justamente onde entram os PNG grandes. Uma logo
 * acima de 4,5 MB era cortada pela plataforma ANTES da função rodar, então o
 * 413 saía sem passar pelo middleware de CORS e o navegador acusava
 * "blocked by CORS policy" — o sintoma escondia a causa. Ver `lib/imagem.ts`.
 */

interface Props {
  rotulo: string;
  descricao: string;
  url: string | null;
  /** Fundo do quadro de amostra: logo pede contraste, wallpaper não. */
  amostraContida?: boolean;
  /**
   * Força o fundo da amostra em vez de usar o vidro do tema em edição.
   *
   * Sem isso, a logo branca do tema escuro some no quadrado enquanto o admin
   * edita o tema claro, e ele conclui que o upload falhou. A amostra precisa
   * mostrar a imagem sobre o fundo em que ela vai aparecer de verdade.
   */
  fundoAmostra?: ModoTema;
  /**
   * Perfil de redimensionamento aplicado antes do envio. O padrão serve para
   * logo; o papel de parede pede `PAPEL_PAREDE`, que cobre a janela inteira.
   */
  otimizar?: OpcoesImagem;
  enviando: boolean;
  aoEnviar: (arquivo: File) => void;
  aoRemover: () => void;
}

export function CampoImagem({
  rotulo,
  descricao,
  url,
  amostraContida = true,
  fundoAmostra,
  otimizar = PERFIL,
  enviando,
  aoEnviar,
  aoRemover,
}: Props) {
  const entrada = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);

  async function selecionar(arquivo: File | null) {
    if (!arquivo) return;

    // O servidor valida de novo; isto só evita a viagem quando dá para saber antes.
    if (!/^image\/(png|jpeg|webp|gif)$/.test(arquivo.type)) {
      setErro('Formato não aceito. Use PNG, JPG, WebP ou GIF.');
      return;
    }
    setErro(null);
    setPreparando(true);

    try {
      const pronto = await prepararImagem(arquivo, otimizar);
      aoEnviar(pronto);

      // Só avisa quando houve ganho de verdade — um "reduzida de 900 KB para
      // 880 KB" é ruído.
      if (arquivo.size - pronto.size > 256 * 1024) {
        toast.success(
          `Imagem otimizada: ${formatarBytes(arquivo.size)} → ${formatarBytes(pronto.size)}.`,
        );
      }
    } catch (falha) {
      // Mensagem no próprio campo, e não em toast: o erro é sobre este arquivo,
      // e a tela tem três campos de imagem iguais lado a lado.
      setErro(
        falha instanceof ImagemInvalidaError
          ? falha.message
          : 'Não foi possível preparar a imagem.',
      );
    } finally {
      setPreparando(false);
    }
  }

  const ocupado = enviando || preparando;

  return (
    <div className="campo">
      <label>{rotulo}</label>
      <span className="texto-pequeno texto-fraco">{descricao}</span>

      <div className="campo-imagem">
        <div
          className={`campo-imagem__amostra ${
            amostraContida ? 'campo-imagem__amostra--contida' : ''
          } ${fundoAmostra ? `campo-imagem__amostra--fundo-${fundoAmostra.toLowerCase()}` : ''}`}
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
              const arquivo = e.target.files?.[0] ?? null;
              // Permite reenviar o mesmo arquivo depois de remover. Precisa
              // acontecer antes do await: o input é reaproveitado pelo React e
              // limpá-lo depois apagaria uma escolha já feita.
              e.target.value = '';
              void selecionar(arquivo);
            }}
          />

          <button
            type="button"
            className="btn btn--pequeno"
            onClick={() => entrada.current?.click()}
            disabled={ocupado}
          >
            {preparando
              ? 'Preparando...'
              : enviando
                ? 'Enviando...'
                : url
                  ? 'Substituir'
                  : 'Enviar imagem'}
          </button>

          {url && (
            <button
              type="button"
              className="btn btn--pequeno btn--perigo"
              onClick={aoRemover}
              disabled={ocupado}
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
