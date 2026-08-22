import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useBlocker } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { Carregando } from '@/components/Carregando';
import { ModalConfirmacao } from '@/components/ModalConfirmacao';
import { mensagemDeErro } from '@/lib/api';
import { chaves } from '@/lib/queryClient';
import { checarContrastes } from '@/lib/tema';
import type { Aparencia, ModoTema, TokensTema } from '@/types';
import { aparenciaApi } from './api';
import { CampoCor } from './CampoCor';
import { CampoImagem } from './CampoImagem';
import { FONTES } from './fontes';
import {
  PreviaCores,
  PreviaFonte,
  PreviaFundo,
  PreviaMedidas,
  PreviaModos,
  PreviaTexto,
  PreviaVidro,
} from './Previa';
import { useTema } from './useTema';
import './aparencia.css';

/** Mesma regra do `REGEX_COR` no DTO do servidor — o cliente só antecipa o 400. */
const REGEX_COR =
  /^(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d{1,3})\s*)?\))$/;

const cor = () => z.string().regex(REGEX_COR, 'Cor inválida');

const esquemaTokens = z.object({
  corPrimaria: cor(),
  corPrimariaEscura: cor(),
  corSucesso: cor(),
  corAlerta: cor(),
  corErro: cor(),
  corInfo: cor(),
  fundo: cor(),
  fundoDegrade: cor(),
  fundoBrilho1: cor(),
  fundoBrilho2: cor(),
  texto: cor(),
  textoSuave: cor(),
  textoFraco: cor(),
  textoSobrePrimaria: cor(),
  vidroFundo: cor(),
  vidroFundoForte: cor(),
  vidroBorda: cor(),
  sombraCor: cor(),
  overlayModal: cor(),
  vidroBlur: z.number().int().min(0).max(40),
  raio: z.number().int().min(0).max(32),
  raioSm: z.number().int().min(0).max(24),
});

const esquema = z.object({
  temaClaro: esquemaTokens,
  temaEscuro: esquemaTokens,
  fonte: z.string().min(1),
  temaPadrao: z.enum(['CLARO', 'ESCURO']),
  permitirAlternancia: z.boolean(),
  papelParedeOpacidade: z.number().int().min(0).max(100),
  papelParedeAjuste: z.enum(['COBRIR', 'CONTER', 'REPETIR']),
});

type FormAparencia = z.infer<typeof esquema>;

type ChavePrevia = 'cores' | 'fundo' | 'texto' | 'vidro';

const GRUPOS: Array<{
  previa: ChavePrevia;
  titulo: string;
  descricao: string;
  cores: Array<{ chave: keyof TokensTema; rotulo: string; alfa?: boolean }>;
}> = [
  {
    previa: 'cores',
    titulo: 'Cores da marca e de estado',
    descricao: 'Usadas em botões, badges, timeline e mensagens de validação.',
    cores: [
      { chave: 'corPrimaria', rotulo: 'Primária' },
      { chave: 'corPrimariaEscura', rotulo: 'Primária (hover)' },
      { chave: 'corSucesso', rotulo: 'Sucesso' },
      { chave: 'corAlerta', rotulo: 'Alerta' },
      { chave: 'corErro', rotulo: 'Erro' },
      { chave: 'corInfo', rotulo: 'Informação' },
    ],
  },
  {
    previa: 'fundo',
    titulo: 'Fundo da página',
    descricao:
      'O gradiente é montado a partir destes quatro: a base, o tom do meio e os dois brilhos radiais do topo.',
    cores: [
      { chave: 'fundo', rotulo: 'Base' },
      { chave: 'fundoDegrade', rotulo: 'Tom do meio' },
      { chave: 'fundoBrilho1', rotulo: 'Brilho esquerdo', alfa: true },
      { chave: 'fundoBrilho2', rotulo: 'Brilho direito', alfa: true },
    ],
  },
  {
    previa: 'texto',
    titulo: 'Texto',
    descricao:
      'Suave é para apoio; fraco é para metadados. O último não herda de nenhum: é o texto do botão primário, que não inverte junto com o tema.',
    cores: [
      { chave: 'texto', rotulo: 'Principal' },
      { chave: 'textoSuave', rotulo: 'Suave', alfa: true },
      { chave: 'textoFraco', rotulo: 'Fraco', alfa: true },
      { chave: 'textoSobrePrimaria', rotulo: 'Sobre o botão primário' },
    ],
  },
  {
    previa: 'vidro',
    titulo: 'Vidro e sombras',
    descricao:
      'As superfícies do painel. No modo claro, opacidade alta demais achata o efeito; baixa demais apaga a separação entre card e página.',
    cores: [
      { chave: 'vidroFundo', rotulo: 'Fundo do vidro', alfa: true },
      { chave: 'vidroFundoForte', rotulo: 'Vidro em destaque', alfa: true },
      { chave: 'vidroBorda', rotulo: 'Borda', alfa: true },
      { chave: 'sombraCor', rotulo: 'Sombra', alfa: true },
      { chave: 'overlayModal', rotulo: 'Fundo de modal', alfa: true },
    ],
  },
];

const NUMERICOS: Array<{
  chave: keyof TokensTema;
  rotulo: string;
  min: number;
  max: number;
  dica: string;
}> = [
  { chave: 'vidroBlur', rotulo: 'Desfoque do vidro', min: 0, max: 40, dica: '0 desliga o efeito' },
  { chave: 'raio', rotulo: 'Raio de borda', min: 0, max: 32, dica: 'Cards, modais e seções' },
  { chave: 'raioSm', rotulo: 'Raio pequeno', min: 0, max: 24, dica: 'Botões, campos e badges' },
];

export function AparenciaPage() {
  const queryClient = useQueryClient();
  const { encerrarPrevisualizacao, previsualizar } = useTema();

  const [modoEmEdicao, setModoEmEdicao] = useState<ModoTema>('ESCURO');
  const [confirmandoRestauracao, setConfirmandoRestauracao] = useState(false);

  const { data: salva, isLoading } = useQuery({
    queryKey: chaves.aparencia,
    queryFn: aparenciaApi.buscar,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { isDirty, errors },
  } = useForm<FormAparencia>({
    resolver: zodResolver(esquema),
    values: salva && {
      temaClaro: salva.temaClaro,
      temaEscuro: salva.temaEscuro,
      fonte: salva.fonte,
      temaPadrao: salva.temaPadrao,
      permitirAlternancia: salva.permitirAlternancia,
      papelParedeOpacidade: salva.papelParedeOpacidade,
      papelParedeAjuste: salva.papelParedeAjuste,
    },
  });

  const valores = watch();

  // Preview ao vivo do painel inteiro, incluindo esta página. Sem debounce:
  // `setProperty` não re-renderiza React e o color picker nativo dispara pouco.
  useEffect(() => {
    if (!valores?.temaClaro || !valores?.temaEscuro || !salva) return;

    const tokens = modoEmEdicao === 'CLARO' ? valores.temaClaro : valores.temaEscuro;
    previsualizar(tokens, valores.fonte, modoEmEdicao, {
      // A imagem em si já está gravada; opacidade e ajuste são do formulário.
      url: salva.papelParedeUrl,
      opacidade: valores.papelParedeOpacidade,
      ajuste: valores.papelParedeAjuste,
    });
  }, [valores, modoEmEdicao, previsualizar, salva]);

  // Sair com preview ativo deixaria o painel pintado com algo não salvo.
  useEffect(() => encerrarPrevisualizacao, [encerrarPrevisualizacao]);

  const bloqueio = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!isDirty) return;
    const aoSair = (evento: BeforeUnloadEvent) => evento.preventDefault();
    window.addEventListener('beforeunload', aoSair);
    return () => window.removeEventListener('beforeunload', aoSair);
  }, [isDirty]);

  const aplicarResposta = (nova: Aparencia, mensagem: string) => {
    queryClient.setQueryData(chaves.aparencia, nova);
    reset({
      temaClaro: nova.temaClaro,
      temaEscuro: nova.temaEscuro,
      fonte: nova.fonte,
      temaPadrao: nova.temaPadrao,
      permitirAlternancia: nova.permitirAlternancia,
      papelParedeOpacidade: nova.papelParedeOpacidade,
      papelParedeAjuste: nova.papelParedeAjuste,
    });
    toast.success(mensagem);
  };

  const salvar = useMutation({
    mutationFn: aparenciaApi.salvar,
    onSuccess: (nova) =>
      aplicarResposta(nova, 'Aparência salva. Vale para todos os usuários do painel.'),
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  const restaurar = useMutation({
    mutationFn: aparenciaApi.restaurarPadrao,
    onSuccess: (nova) => {
      aplicarResposta(nova, 'Preset "Padrão ProCert" restaurado.');
      setConfirmandoRestauracao(false);
    },
    onError: (erro) => {
      setConfirmandoRestauracao(false);
      toast.error(mensagemDeErro(erro));
    },
  });

  const logoTemaClaro = useMutation({
    mutationFn: (arquivo: File | null) =>
      arquivo
        ? aparenciaApi.enviarLogo('CLARO', arquivo)
        : aparenciaApi.removerLogo('CLARO'),
    onSuccess: (nova) => aplicarResposta(nova, 'Logo do tema claro atualizada.'),
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  const logoTemaEscuro = useMutation({
    mutationFn: (arquivo: File | null) =>
      arquivo
        ? aparenciaApi.enviarLogo('ESCURO', arquivo)
        : aparenciaApi.removerLogo('ESCURO'),
    onSuccess: (nova) => aplicarResposta(nova, 'Logo do tema escuro atualizada.'),
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  const papelParede = useMutation({
    mutationFn: (arquivo: File | null) =>
      arquivo
        ? aparenciaApi.enviarPapelParede(arquivo)
        : aparenciaApi.removerPapelParede(),
    onSuccess: (nova) => aplicarResposta(nova, 'Papel de parede atualizado.'),
    onError: (erro) => toast.error(mensagemDeErro(erro)),
  });

  const contrastes = useMemo(() => {
    const tokens = modoEmEdicao === 'CLARO' ? valores?.temaClaro : valores?.temaEscuro;
    return tokens ? checarContrastes(tokens) : [];
  }, [valores, modoEmEdicao]);

  const reprovados = contrastes.filter((c) => !c.passa);

  if (isLoading || !salva) {
    return <Carregando mensagem="Carregando aparência..." />;
  }

  const chaveTokens = modoEmEdicao === 'CLARO' ? 'temaClaro' : 'temaEscuro';
  const tokensAtuais = valores[chaveTokens];
  const fonteAtual = valores.fonte ?? salva.fonte;

  const definirToken = (chave: keyof TokensTema, valor: string | number) =>
    setValue(`${chaveTokens}.${chave}` as const, valor as never, { shouldDirty: true });

  const aoSubmeter = handleSubmit((dados) =>
    salvar.mutate({ ...dados, atualizadoEmVisto: salva.atualizadoEm ?? undefined }),
  );

  const previas: Record<ChavePrevia, ReactNode> = {
    cores: <PreviaCores tokens={tokensAtuais} fonteId={fonteAtual} />,
    fundo: <PreviaFundo tokens={tokensAtuais} fonteId={fonteAtual} />,
    texto: <PreviaTexto tokens={tokensAtuais} fonteId={fonteAtual} />,
    vidro: <PreviaVidro tokens={tokensAtuais} fonteId={fonteAtual} />,
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Aparência"
        descricao="Personaliza os design tokens do painel. O que você salva aqui vale para todos os usuários."
        acoes={
          <>
            <button
              type="button"
              className="btn"
              onClick={() => setConfirmandoRestauracao(true)}
              disabled={restaurar.isPending}
            >
              Restaurar padrão
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => reset()}
              disabled={!isDirty || salvar.isPending}
            >
              Descartar alterações
            </button>
            <button
              type="button"
              className="btn btn--primario"
              onClick={aoSubmeter}
              disabled={!isDirty || salvar.isPending}
            >
              {salvar.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      />

      {isDirty && (
        <div className="vidro aparencia__aviso">
          <strong>Pré-visualizando.</strong> O painel já está pintado com estas cores,
          mas nada foi gravado — só o botão Salvar aplica para os outros usuários.
        </div>
      )}

      <section className="vidro card">
        <div className="entre">
          <div>
            <h2 style={{ fontSize: '1.05rem' }}>Editando o modo</h2>
            <p className="texto-pequeno texto-suave" style={{ margin: 0 }}>
              Cada modo tem seu próprio conjunto de tokens. Alternar aqui muda o que você
              edita e o que as prévias mostram.
            </p>
          </div>

          <div className="linha-flex">
            {(['ESCURO', 'CLARO'] as const).map((modo) => (
              <button
                key={modo}
                type="button"
                className={`btn ${modoEmEdicao === modo ? 'btn--primario' : ''}`}
                onClick={() => setModoEmEdicao(modo)}
              >
                {modo === 'ESCURO' ? 'Escuro' : 'Claro'}
              </button>
            ))}
          </div>
        </div>

        <h3 style={{ fontSize: '0.9rem', margin: '18px 0 0' }}>Os dois lado a lado</h3>
        <p className="texto-pequeno texto-suave">
          Serve para conferir a paridade: o que você ajustou num modo costuma precisar de
          contrapartida no outro.
        </p>
        <PreviaModos
          temaClaro={valores.temaClaro}
          temaEscuro={valores.temaEscuro}
          fonteId={fonteAtual}
        />
      </section>

      <section className="vidro card">
        <h2 style={{ fontSize: '1.05rem' }}>Contraste (WCAG AA)</h2>
        <p className="texto-pequeno texto-suave">
          Calculado sobre o modo em edição, achatando as superfícies translúcidas sobre o
          fundo. É um aviso, não um bloqueio: a decisão final é sua.
        </p>

        <ul className="aparencia__contraste">
          {contrastes.map((c) => (
            <li key={c.rotulo}>
              <span className={`badge ${c.passa ? 'badge--aprovado' : 'badge--reprovado'}`}>
                {c.razao === null ? '—' : `${c.razao.toFixed(2)}:1`}
              </span>
              <span>{c.rotulo}</span>
              <span className="texto-fraco texto-pequeno">mín. {c.minimo}:1</span>
            </li>
          ))}
        </ul>

        {reprovados.length > 0 && (
          <p className="campo__erro" role="status">
            {reprovados.length} combinação(ões) abaixo do mínimo recomendado. Textos podem
            ficar difíceis de ler para parte dos usuários.
          </p>
        )}
      </section>

      {GRUPOS.map((grupo) => (
        <section key={grupo.titulo} className="vidro card">
          <h2 style={{ fontSize: '1.05rem' }}>{grupo.titulo}</h2>
          <p className="texto-pequeno texto-suave">{grupo.descricao}</p>

          <div className="aparencia__com-previa">
            <div className="aparencia__grade">
              {grupo.cores.map(({ chave, rotulo, alfa }) => (
                <CampoCor
                  key={chave}
                  rotulo={rotulo}
                  comAlfa={alfa}
                  valor={String(tokensAtuais?.[chave] ?? '#000000')}
                  aoAlterar={(valor) => definirToken(chave, valor)}
                />
              ))}
            </div>

            {previas[grupo.previa]}
          </div>
        </section>
      ))}

      <section className="vidro card">
        <h2 style={{ fontSize: '1.05rem' }}>Medidas</h2>

        <div className="aparencia__com-previa">
          <div className="aparencia__grade">
            {NUMERICOS.map(({ chave, rotulo, min, max, dica }) => {
              const valor = Number(tokensAtuais?.[chave] ?? 0);
              return (
                <div key={chave} className="campo-cor">
                  <label className="campo-cor__rotulo" htmlFor={`num-${chave}`}>
                    {rotulo} — {valor}px
                  </label>
                  <input
                    id={`num-${chave}`}
                    type="range"
                    min={min}
                    max={max}
                    value={valor}
                    onChange={(e) => definirToken(chave, Number(e.target.value))}
                  />
                  <span className="texto-pequeno texto-fraco">{dica}</span>
                </div>
              );
            })}
          </div>

          <PreviaMedidas tokens={tokensAtuais} fonteId={fonteAtual} />
        </div>
      </section>

      <section className="vidro card">
        <h2 style={{ fontSize: '1.05rem' }}>Tipografia</h2>
        <p className="texto-pequeno texto-suave">
          A fonte é global aos dois modos. As famílias do Google entram sob demanda — só
          baixa a que você escolher. A lista é fechada: campo livre aceitaria fontes que
          não existem na máquina dos usuários.
        </p>

        <div className="aparencia__com-previa">
          <div className="campo">
            <label htmlFor="fonte">Fonte do painel</label>
            <select id="fonte" {...register('fonte')}>
              {FONTES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.rotulo}
                </option>
              ))}
            </select>
            {errors.fonte && <span className="campo__erro">{errors.fonte.message}</span>}
          </div>

          <PreviaFonte tokens={tokensAtuais} fonteId={fonteAtual} />
        </div>
      </section>

      <section className="vidro card">
        <h2 style={{ fontSize: '1.05rem' }}>Logo e papel de parede</h2>
        <p className="texto-pequeno texto-suave">
          Imagens são enviadas na hora, fora do formulário — não passam pelo botão Salvar
          nem pelo Descartar. Para desfazer, use Remover.
        </p>
        <p className="texto-pequeno texto-suave">
          Enviar só uma das duas logos é válido: ela é usada nos dois temas. O painel
          prefere ficar com a marca de contraste imperfeito a ficar sem marca nenhuma.
        </p>

        <div className="form-grade">
          <CampoImagem
            rotulo="Logo — tema claro"
            descricao="Usada na sidebar quando o painel está no tema claro. Como o fundo é claro, prefira a versão de traço escuro, em PNG com fundo transparente."
            url={salva.logoTemaClaroUrl}
            fundoAmostra="CLARO"
            enviando={logoTemaClaro.isPending}
            aoEnviar={(arquivo) => logoTemaClaro.mutate(arquivo)}
            aoRemover={() => logoTemaClaro.mutate(null)}
          />

          <CampoImagem
            rotulo="Logo — tema escuro"
            descricao="Usada na sidebar no tema escuro e sempre no cabeçalho do site público, cujo hero é escuro nos dois modos. Prefira a versão de traço claro."
            url={salva.logoTemaEscuroUrl}
            fundoAmostra="ESCURO"
            enviando={logoTemaEscuro.isPending}
            aoEnviar={(arquivo) => logoTemaEscuro.mutate(arquivo)}
            aoRemover={() => logoTemaEscuro.mutate(null)}
          />

          <CampoImagem
            rotulo="Papel de parede"
            descricao="Fundo do painel, atrás do gradiente. Vale para os dois modos — prefira uma imagem de baixo contraste."
            url={salva.papelParedeUrl}
            amostraContida={false}
            enviando={papelParede.isPending}
            aoEnviar={(arquivo) => papelParede.mutate(arquivo)}
            aoRemover={() => papelParede.mutate(null)}
          />
        </div>

        <div className="form-grade" style={{ marginTop: 16 }}>
          <div className="campo-cor">
            <label className="campo-cor__rotulo" htmlFor="opacidade">
              Opacidade do papel de parede — {valores.papelParedeOpacidade ?? 0}%
            </label>
            <input
              id="opacidade"
              type="range"
              min={0}
              max={100}
              value={valores.papelParedeOpacidade ?? 0}
              onChange={(e) =>
                setValue('papelParedeOpacidade', Number(e.target.value), {
                  shouldDirty: true,
                })
              }
            />
            <span className="texto-pequeno texto-fraco">
              0 desliga sem apagar a imagem. Acima de ~50% o texto começa a competir com o
              fundo.
            </span>
          </div>

          <div className="campo">
            <label htmlFor="ajuste">Ajuste</label>
            <select id="ajuste" {...register('papelParedeAjuste')}>
              <option value="COBRIR">Cobrir (preenche a tela, pode cortar)</option>
              <option value="CONTER">Conter (imagem inteira, pode sobrar)</option>
              <option value="REPETIR">Repetir (padrão em ladrilho)</option>
            </select>
          </div>
        </div>
      </section>

      <section className="vidro card">
        <h2 style={{ fontSize: '1.05rem' }}>Comportamento</h2>

        <div className="form-grade">
          <div className="campo">
            <label htmlFor="temaPadrao">Modo padrão</label>
            <select id="temaPadrao" {...register('temaPadrao')}>
              <option value="ESCURO">Escuro</option>
              <option value="CLARO">Claro</option>
            </select>
            <span className="texto-pequeno texto-fraco">
              Vale para quem nunca escolheu um modo.
            </span>
          </div>

          <div className="campo">
            <label htmlFor="permitirAlternancia">Alternância pelo usuário</label>
            <select
              id="permitirAlternancia"
              {...register('permitirAlternancia', {
                setValueAs: (v) => v === 'true' || v === true,
              })}
            >
              <option value="true">Permitida</option>
              <option value="false">Travada no modo padrão</option>
            </select>
            <span className="texto-pequeno texto-fraco">
              Permitida: cada usuário escolhe no topo, guardado no navegador dele.
            </span>
          </div>
        </div>
      </section>

      <p className="texto-pequeno texto-fraco">
        {salva.personalizada
          ? `Última alteração por ${salva.atualizadoPor ?? 'desconhecido'} em ${
              salva.atualizadoEm
                ? new Date(salva.atualizadoEm).toLocaleString('pt-BR')
                : '—'
            }.`
          : 'Nenhuma personalização salva — o painel está no preset "Padrão ProCert".'}
      </p>

      <ModalConfirmacao
        aberto={confirmandoRestauracao}
        titulo="Restaurar o preset padrão?"
        mensagem='Descarta a personalização salva, apaga as logos e o papel de parede enviados, e volta o painel ao tema "Padrão ProCert" para todos os usuários. Não dá para desfazer.'
        rotuloConfirmar="Restaurar"
        perigo
        carregando={restaurar.isPending}
        aoConfirmar={() => restaurar.mutate()}
        aoCancelar={() => setConfirmandoRestauracao(false)}
      />

      <ModalConfirmacao
        aberto={bloqueio.state === 'blocked'}
        titulo="Sair sem salvar?"
        mensagem="Você alterou a aparência e ainda não salvou. Sair agora descarta as alterações."
        rotuloConfirmar="Sair sem salvar"
        perigo
        aoConfirmar={() => bloqueio.proceed?.()}
        aoCancelar={() => bloqueio.reset?.()}
      />
    </>
  );
}
