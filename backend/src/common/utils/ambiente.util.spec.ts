import { ConfigService } from '@nestjs/config';

import { conferirAmbiente, urlDoPainel } from './ambiente.util';

/**
 * `ConfigService` de mentira, respeitando o default do segundo argumento.
 *
 * `mockDeep` não serve aqui: `get` tem sobrecarga com valor padrão, e é
 * justamente o comportamento do default que estes testes exercitam.
 */
function config(valores: Record<string, string>): ConfigService {
  return {
    get: (chave: string, padrao?: string) => valores[chave] ?? padrao,
  } as unknown as ConfigService;
}

describe('urlDoPainel', () => {
  it('usa FRONTEND_URL quando ela existe', () => {
    expect(
      urlDoPainel(config({ FRONTEND_URL: 'https://painel.exemplo.com.br' })),
    ).toBe('https://painel.exemplo.com.br');
  });

  /**
   * O link é sempre concatenado com um caminho que já começa em `/`
   * (`/redefinir-senha`, `/certificacoes/produto/1`). Sem aparar a barra, o
   * resultado tem `//` no meio — que funciona no navegador e fica torto dentro
   * do PDF do certificado, onde o endereço é lido por uma pessoa.
   */
  it('apara a barra final, que viraria // no meio do link', () => {
    expect(
      urlDoPainel(config({ FRONTEND_URL: 'https://painel.exemplo.com.br/' })),
    ).toBe('https://painel.exemplo.com.br');
  });

  it('deriva de CORS_ORIGINS quando FRONTEND_URL não foi definida', () => {
    expect(
      urlDoPainel(config({ CORS_ORIGINS: 'https://procert-app.vercel.app' })),
    ).toBe('https://procert-app.vercel.app');
  });

  /**
   * `CORS_ORIGINS` aceita lista; a primeira é a origem canônica. As variações
   * (`www.`) servem para autorizar requisição, não para montar o endereço que
   * vai impresso num certificado.
   */
  it('da lista de CORS_ORIGINS, toma só a primeira origem', () => {
    expect(
      urlDoPainel(
        config({
          CORS_ORIGINS: 'https://procertocp.com.br, https://www.procertocp.com.br',
        }),
      ),
    ).toBe('https://procertocp.com.br');
  });

  it('FRONTEND_URL tem precedência sobre CORS_ORIGINS', () => {
    expect(
      urlDoPainel(
        config({
          FRONTEND_URL: 'https://painel.exemplo.com.br',
          CORS_ORIGINS: 'https://outro.exemplo.com.br',
        }),
      ),
    ).toBe('https://painel.exemplo.com.br');
  });

  it('sem nenhuma das duas, cai no localhost do desenvolvimento', () => {
    expect(urlDoPainel(config({}))).toBe('http://localhost:5173');
  });

  /** String vazia é o que a Vercel entrega para variável criada e não preenchida. */
  it('trata variável vazia como ausente, não como valor', () => {
    expect(
      urlDoPainel(
        config({ FRONTEND_URL: '   ', CORS_ORIGINS: 'https://derivada.com.br' }),
      ),
    ).toBe('https://derivada.com.br');
  });
});

describe('conferirAmbiente', () => {
  const smtpCompleto = {
    NODE_ENV: 'production',
    MAIL_HOST: 'smtp.hostinger.com',
    MAIL_USER: 'nao-responda@procertocp.com.br',
    MAIL_PASS: 'segredo',
    FRONTEND_URL: 'https://painel.exemplo.com.br',
  };

  it('fora de produção não reclama de nada', () => {
    expect(conferirAmbiente(config({ NODE_ENV: 'development' }))).toEqual([]);
    expect(conferirAmbiente(config({ NODE_ENV: 'test' }))).toEqual([]);
  });

  it('ambiente completo em produção não gera problema', () => {
    expect(conferirAmbiente(config(smtpCompleto))).toEqual([]);
  });

  /**
   * O caso real medido em 01/09/2026: produção rodava sem nenhuma das três
   * variáveis de SMTP, e nenhum e-mail jamais saiu — nem o de redefinição de
   * senha. A mensagem precisa nomear as que faltam, porque preencher duas de
   * três deixa o sistema exatamente tão mudo quanto antes.
   */
  it('em produção sem SMTP, nomeia as variáveis que faltam', () => {
    const [problema] = conferirAmbiente(
      config({ NODE_ENV: 'production', FRONTEND_URL: 'https://x.com.br' }),
    );

    expect(problema).toContain('MAIL_HOST');
    expect(problema).toContain('MAIL_USER');
    expect(problema).toContain('MAIL_PASS');
  });

  it('SMTP pela metade ainda é problema, e só a parte faltante é citada', () => {
    const [problema] = conferirAmbiente(
      config({ ...smtpCompleto, MAIL_PASS: '' }),
    );

    expect(problema).toContain('MAIL_PASS');
    expect(problema).not.toContain('MAIL_HOST');
  });

  it('avisa quando FRONTEND_URL está ausente, mostrando o valor derivado', () => {
    const problemas = conferirAmbiente(
      config({
        ...smtpCompleto,
        FRONTEND_URL: '',
        CORS_ORIGINS: 'https://procert-app.vercel.app',
      }),
    );

    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain('https://procert-app.vercel.app');
  });

  /**
   * Não lançar é a decisão de projeto deste arquivo, e não um esquecimento:
   * sem SMTP o sistema todo funciona, só não avisa ninguém. Derrubar o boot
   * trocaria uma funcionalidade ausente por uma API fora do ar.
   */
  it('devolve os problemas em vez de lançar', () => {
    expect(() => conferirAmbiente(config({ NODE_ENV: 'production' }))).not.toThrow();
    expect(conferirAmbiente(config({ NODE_ENV: 'production' })).length).toBeGreaterThan(0);
  });
});
