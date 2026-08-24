import { ConfigService } from '@nestjs/config';
import { mockDeep } from 'jest-mock-extended';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ArmazenamentoDisco,
  ArmazenamentoSupabase,
  criarArmazenamento,
  mimeDaExtensao,
} from './uploads.armazenamento';

/** ConfigService de mentira, lendo de um `.env` em memória. */
function configCom(valores: Record<string, string>): ConfigService {
  const config = mockDeep<ConfigService>();
  config.get.mockImplementation(
    (chave: string, padrao?: unknown) => (valores[chave] ?? padrao) as never,
  );
  return config;
}

const SUPABASE = {
  url: 'https://projeto.supabase.co',
  chaveServico: 'chave-de-servico',
  bucketPublico: 'procert-publico',
  bucketPrivado: 'procert-privado',
};

function respostaFalsa(
  ok: boolean,
  corpo = '',
  status = ok ? 200 : 400,
): Response {
  return {
    ok,
    status,
    text: async () => corpo,
    arrayBuffer: async () => Buffer.from(corpo),
  } as unknown as Response;
}

describe('mimeDaExtensao', () => {
  it.each([
    ['.pdf', 'application/pdf'],
    ['.PDF', 'application/pdf'],
    ['.csv', 'text/csv'],
  ])('%s → %s', (extensao, esperado) => {
    expect(mimeDaExtensao(extensao)).toBe(esperado);
  });

  it('extensão desconhecida cai no genérico, nunca em undefined', () => {
    // O MIME vai como Content-Type no upload do Storage; `undefined` ali viraria
    // um arquivo servido como text/plain.
    expect(mimeDaExtensao('.xyz')).toBe('application/octet-stream');
  });
});

describe('ArmazenamentoDisco', () => {
  let baseDir: string;
  let disco: ArmazenamentoDisco;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'procert-uploads-'));
    disco = new ArmazenamentoDisco(baseDir);
  });

  it('grava e relê o mesmo conteúdo, criando a pasta', async () => {
    await disco.gravar('produtos', 'a.png', Buffer.from('imagem'), 'image/png');

    expect(readFileSync(join(baseDir, 'produtos', 'a.png')).toString()).toBe(
      'imagem',
    );
    expect((await disco.ler('produtos', 'a.png'))?.toString()).toBe('imagem');
  });

  it('ler devolve null para arquivo ausente, em vez de lançar', async () => {
    await expect(disco.ler('produtos', 'nao-existe.png')).resolves.toBeNull();
  });

  it('remover não propaga falha de arquivo ausente', async () => {
    await expect(
      disco.remover('produtos', 'nao-existe.png'),
    ).resolves.toBeUndefined();
  });

  it('não lê fora da raiz, mesmo com travessia no nome', async () => {
    // Segunda barreira: o UploadsService já recusa isso antes de chegar aqui.
    // Ela existe porque a confinação não deve depender da diligência de quem
    // chama — e é o que sobra se um nome vier do banco populado pelo ETL.
    writeFileSync(join(baseDir, '..', 'segredo-procert.txt'), 'nao-deveria-sair');

    expect(disco.caminho('produtos', '../../segredo-procert.txt')).toBeNull();
    await expect(
      disco.ler('produtos', '../../segredo-procert.txt'),
    ).resolves.toBeNull();
  });

  it('não publica URL por conta própria — quem serve é o estático do Nest', () => {
    expect(disco.urlPublica()).toBeNull();
  });
});

describe('ArmazenamentoSupabase', () => {
  let supabase: ArmazenamentoSupabase;
  let requisicao: jest.Mock;

  beforeEach(() => {
    supabase = new ArmazenamentoSupabase(SUPABASE);
    requisicao = jest.fn().mockResolvedValue(respostaFalsa(true, '{}'));
    global.fetch = requisicao as unknown as typeof fetch;
  });

  it('grava pasta pública no bucket público', async () => {
    await supabase.gravar('produtos', 'a.png', Buffer.from('x'), 'image/png');

    const [url, opcoes] = requisicao.mock.calls[0];
    expect(url).toBe(
      'https://projeto.supabase.co/storage/v1/object/procert-publico/produtos/a.png',
    );
    expect(opcoes.method).toBe('POST');
    expect(opcoes.headers['Content-Type']).toBe('image/png');
    expect(opcoes.headers.Authorization).toBe('Bearer chave-de-servico');
  });

  it.each([
    ['certificados', 'procert-privado'],
    ['certificacoes', 'procert-privado'],
    ['clientes', 'procert-publico'],
    ['aparencia', 'procert-publico'],
  ] as const)('%s vai para o bucket %s', async (pasta, bucket) => {
    // A divisão de buckets é o que sustenta a fronteira de PASTAS_PUBLICAS ×
    // PASTAS_PRIVADAS fora do disco: PDF de certificado num bucket com leitura
    // anônima estaria aberto para quem tivesse a URL.
    await supabase.gravar(pasta, 'a.pdf', Buffer.from('x'), 'application/pdf');

    expect(requisicao.mock.calls[0][0]).toContain(`/object/${bucket}/${pasta}/`);
  });

  it('propaga falha de gravação com status e corpo', async () => {
    // Engolir aqui gravaria no banco a URL de um arquivo que nunca existiu.
    requisicao.mockResolvedValue(respostaFalsa(false, 'Bucket not found', 404));

    await expect(
      supabase.gravar('produtos', 'a.png', Buffer.from('x'), 'image/png'),
    ).rejects.toThrow(/404.*Bucket not found/s);
  });

  it('ler devolve o conteúdo em 200 e null em erro', async () => {
    requisicao.mockResolvedValue(respostaFalsa(true, 'conteudo'));
    expect((await supabase.ler('certificados', 'a.pdf'))?.toString()).toBe(
      'conteudo',
    );

    requisicao.mockResolvedValue(respostaFalsa(false, '', 404));
    await expect(supabase.ler('certificados', 'a.pdf')).resolves.toBeNull();
  });

  it('remover não propaga erro de rede — remover é sempre acessório', async () => {
    requisicao.mockRejectedValue(new Error('rede caiu'));

    await expect(supabase.remover('produtos', 'a.png')).resolves.toBeUndefined();
  });

  it('urlPublica aponta para o bucket público, sem assinatura', () => {
    expect(supabase.urlPublica('aparencia', 'logo.png')).toBe(
      'https://projeto.supabase.co/storage/v1/object/public/procert-publico/aparencia/logo.png',
    );
  });
});

describe('criarArmazenamento', () => {
  it('sem UPLOAD_DRIVER usa o disco — nada muda para quem já roda local', () => {
    expect(criarArmazenamento(configCom({}))).toBeInstanceOf(ArmazenamentoDisco);
  });

  it('resolve UPLOAD_DIR a partir do cwd', async () => {
    const raiz = mkdtempSync(join(tmpdir(), 'procert-driver-'));
    await mkdir(join(raiz, 'produtos'), { recursive: true });
    const driver = criarArmazenamento(
      configCom({ UPLOAD_DIR: raiz }),
    ) as ArmazenamentoDisco;

    expect(driver.caminho('produtos', 'a.png')).toBe(
      join(raiz, 'produtos', 'a.png'),
    );
  });

  it('UPLOAD_DRIVER=supabase com as chaves devolve o driver do Storage', () => {
    const driver = criarArmazenamento(
      configCom({
        UPLOAD_DRIVER: 'supabase',
        SUPABASE_URL: 'https://projeto.supabase.co/',
        SUPABASE_SERVICE_ROLE_KEY: 'chave',
      }),
    );

    expect(driver).toBeInstanceOf(ArmazenamentoSupabase);
    // A barra final da URL é aparada: sem isso toda requisição sairia com `//`.
    expect(driver.urlPublica('produtos', 'a.png')).toBe(
      'https://projeto.supabase.co/storage/v1/object/public/procert-publico/produtos/a.png',
    );
  });

  it.each([
    ['SUPABASE_URL', { SUPABASE_SERVICE_ROLE_KEY: 'chave' }],
    ['SUPABASE_SERVICE_ROLE_KEY', { SUPABASE_URL: 'https://x.supabase.co' }],
  ])('quebra no boot sem %s', (faltante, valores) => {
    // Cair de volta no disco num ambiente serverless perderia arquivo em
    // silêncio: o upload responde 200 e o byte some na próxima instância.
    expect(() =>
      criarArmazenamento(configCom({ UPLOAD_DRIVER: 'supabase', ...valores })),
    ).toThrow(faltante as string);
  });

  it('recusa driver desconhecido em vez de escolher um', () => {
    expect(() => criarArmazenamento(configCom({ UPLOAD_DRIVER: 's3' }))).toThrow(
      /UPLOAD_DRIVER inválido/,
    );
  });
});
