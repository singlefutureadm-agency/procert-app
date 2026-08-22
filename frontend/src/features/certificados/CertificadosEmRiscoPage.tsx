import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { CabecalhoPagina } from '@/components/CabecalhoPagina';
import { Carregando } from '@/components/Carregando';
import { EstadoVazio } from '@/components/EstadoVazio';
import { Icone } from '@/components/Icone';
import { Paginacao } from '@/components/Paginacao';
import { chaves } from '@/lib/queryClient';
import { formatarData } from '@/lib/formatadores';
import type { CertificadoEmRisco, ChaveFaixaVencimento } from '@/types';
import { certificadosApi } from './api';
import { CartaoCertificado } from './CartaoCertificado';

/**
 * Janelas oferecidas. Coincidem com os cortes de `FAIXAS_VENCIMENTO` no
 * servidor de propósito: escolher 60 aqui e o resumo contar "31 a 60" ali
 * precisa dar o mesmo conjunto, senão a tela se contradiz.
 */
const JANELAS = [30, 60, 90, 180] as const;

/** Faixas que a janela escolhida já cobre — as demais ficam apagadas. */
function faixasCobertas(dias: number): ChaveFaixaVencimento[] {
  const cobertas: ChaveFaixaVencimento[] = ['vencido'];
  if (dias >= 30) cobertas.push('30');
  if (dias >= 60) cobertas.push('60');
  if (dias >= 90) cobertas.push('90');
  if (dias >= 180) cobertas.push('180');
  return cobertas;
}

/**
 * Urgência em texto, não só em cor.
 *
 * O cartão já traz a data, mas data exige conta mental: "12/09/2026" não diz
 * sozinho se é problema desta semana. O número de dias diz.
 */
function SeloUrgencia({ dias }: { dias: number }) {
  if (dias < 0) {
    return (
      <span className="badge badge--reprovado sem-quebra">
        vencido há {Math.abs(dias)} dia(s)
      </span>
    );
  }
  if (dias === 0) {
    return <span className="badge badge--reprovado sem-quebra">vence hoje</span>;
  }
  return (
    <span
      className={`badge sem-quebra ${dias <= 30 ? 'badge--pendente' : 'badge--andamento'}`}
    >
      vence em {dias} dia(s)
    </span>
  );
}

export function CertificadosEmRiscoPage() {
  const [dias, setDias] = useState<number>(90);
  const [pagina, setPagina] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: chaves.certificadosEmRisco(dias, pagina),
    queryFn: () => certificadosApi.emRisco({ dias, pagina, limite: 20 }),
  });

  const trocarJanela = (nova: number) => {
    setDias(nova);
    // Sem isto, sair de 180 (3 páginas) para 30 (1 página) deixaria a tela
    // pedindo a página 3 de um conjunto que agora tem uma — resultado vazio,
    // sem nada explicando por quê.
    setPagina(1);
  };

  const cobertas = faixasCobertas(dias);

  return (
    <>
      <CabecalhoPagina
        titulo="Certificações em risco"
        descricao="Certificados vigentes ordenados por urgência de renovação — o que vence primeiro aparece primeiro."
      />

      <section className="vidro card">
        <div className="filtros-linha" role="group" aria-label="Janela de vencimento">
          {JANELAS.map((janela) => (
            <button
              key={janela}
              type="button"
              className={`btn btn--pequeno ${dias === janela ? 'btn--primario' : ''}`}
              aria-pressed={dias === janela}
              onClick={() => trocarJanela(janela)}
            >
              Próximos {janela} dias
            </button>
          ))}
        </div>

        {data && (
          <>
            <ul className="risco-resumo">
              {data.resumo.faixas.map((faixa) => (
                <li
                  key={faixa.chave}
                  className={`risco-resumo__item ${
                    cobertas.includes(faixa.chave) ? 'risco-resumo__item--na-janela' : ''
                  } ${
                    faixa.chave === 'vencido' && faixa.total > 0
                      ? 'risco-resumo__item--critico'
                      : ''
                  }`}
                >
                  <strong>{faixa.total}</strong>
                  <span>{faixa.rotulo}</span>
                </li>
              ))}
            </ul>

            {/*
              O resumo conta a carteira vigente INTEIRA, não a janela nem a
              página — é o mesmo motivo pelo qual os gráficos do painel não são
              montados sobre a listagem: um total somado do que está na tela
              diria "2 vencidos" havendo 11, e pareceria certo.
            */}
            <p className="texto-pequeno texto-fraco">
              Distribuição de toda a carteira vigente ({data.resumo.totalVigentes}{' '}
              certificado(s)). As faixas em destaque são as que a janela escolhida
              cobre. Cancelados e já expirados pela rotina não entram.
            </p>
          </>
        )}
      </section>

      {isLoading ? (
        <Carregando />
      ) : !data || data.dados.length === 0 ? (
        <EstadoVazio
          icone="verificado"
          titulo="Nenhum certificado vence nessa janela"
          descricao={`Nada a renovar nos próximos ${dias} dias. Amplie a janela para enxergar mais adiante.`}
        />
      ) : (
        <>
          <div className="nc-lista">
            {data.dados.map((certificado: CertificadoEmRisco) => (
              <CartaoCertificado
                key={certificado.id}
                certificado={certificado}
                aviso={<SeloUrgencia dias={certificado.diasRestantes} />}
                contexto={
                  <>
                    {certificado.produto.nome} · {certificado.produto.cliente.nome}
                    {' · válido até '}
                    {formatarData(certificado.dataValidade)}
                  </>
                }
                acoes={
                  <>
                    <Link
                      className="btn btn--pequeno"
                      to={`/certificacoes/produto/${certificado.produtoId}`}
                    >
                      <Icone nome="prancheta" tamanho={16} />
                      Abrir trilha
                    </Link>
                    <button
                      type="button"
                      className="btn btn--pequeno"
                      onClick={() =>
                        certificadosApi.abrirPdf(certificado.id, certificado.numero)
                      }
                    >
                      <Icone nome="download" tamanho={16} />
                      Baixar PDF
                    </button>
                  </>
                }
              />
            ))}
          </div>

          <Paginacao
            pagina={data.pagina}
            totalPaginas={data.totalPaginas}
            total={data.total}
            aoMudar={setPagina}
          />
        </>
      )}
    </>
  );
}
