import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mockDeep } from 'jest-mock-extended';

import type { Armazenamento } from './uploads.armazenamento';
import { UploadsService } from './uploads.service';

/** Multer entrega o arquivo em memória; só estes campos são lidos. */
function arquivo(
  mimetype: string,
  { tamanho = 1024, nome = 'foto.png' } = {},
): Express.Multer.File {
  return {
    mimetype,
    size: tamanho,
    originalname: nome,
    buffer: Buffer.from('conteudo'),
  } as Express.Multer.File;
}

describe('UploadsService', () => {
  let servico: UploadsService;
  let armazenamento: jest.Mocked<Armazenamento>;

  beforeEach(() => {
    const config = mockDeep<ConfigService>();
    config.get.mockImplementation(
      (chave: string, padrao?: unknown) =>
        (chave === 'UPLOAD_MAX_SIZE_MB' ? 5 : padrao) as never,
    );

    armazenamento = {
      nome: 'falso',
      gravar: jest.fn().mockResolvedValue(undefined),
      ler: jest.fn().mockResolvedValue(Buffer.from('bytes')),
      remover: jest.fn().mockResolvedValue(undefined),
      urlPublica: jest.fn().mockReturnValue(null),
    };

    servico = new UploadsService(config, armazenamento);
  });

  describe('salvarImagem', () => {
    it('grava com nome em UUID e devolve a URL relativa', async () => {
      const url = await servico.salvarImagem(arquivo('image/png'), 'produtos');

      // A forma da URL é contrato: é ela que vai para o banco e é a mesma nos
      // dois drivers.
      expect(url).toMatch(
        /^\/uploads\/produtos\/[0-9a-f-]{36}\.png$/,
      );

      const [pasta, nomeArquivo, conteudo, tipoMime] =
        armazenamento.gravar.mock.calls[0];
      expect(pasta).toBe('produtos');
      expect(url.endsWith(nomeArquivo)).toBe(true);
      expect(conteudo.toString()).toBe('conteudo');
      expect(tipoMime).toBe('image/png');
    });

    it('a extensão vem do MIME, não do nome enviado', async () => {
      // O nome original é texto do usuário: aceitar a extensão dele era como o
      // legado deixava passar `.php`.
      const url = await servico.salvarImagem(
        arquivo('image/png', { nome: 'foto.php' }),
        'produtos',
      );

      expect(url.endsWith('.png')).toBe(true);
    });

    it.each([
      ['application/pdf'],
      ['text/html'],
      ['application/x-httpd-php'],
    ])('recusa %s e não chega a gravar', async (mime) => {
      await expect(
        servico.salvarImagem(arquivo(mime), 'produtos'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(armazenamento.gravar).not.toHaveBeenCalled();
    });

    it('recusa arquivo acima do limite', async () => {
      await expect(
        servico.salvarImagem(
          arquivo('image/png', { tamanho: 6 * 1024 * 1024 }),
          'produtos',
        ),
      ).rejects.toThrow(/Máximo: 5 MB/);
    });
  });

  describe('salvarDocumento', () => {
    it('aceita PDF de laudo, que a imagem recusa', async () => {
      const url = await servico.salvarDocumento(
        arquivo('application/pdf', { nome: 'laudo.pdf' }),
        'certificacoes',
      );

      expect(url).toMatch(/^\/uploads\/certificacoes\/[0-9a-f-]{36}\.pdf$/);
    });

    it('continua sendo allowlist — executável não passa', async () => {
      await expect(
        servico.salvarDocumento(
          arquivo('application/x-msdownload', { nome: 'a.exe' }),
          'certificacoes',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('salvarArquivoGerado', () => {
    it('deriva o MIME da extensão, sem passar pelo allowlist de upload', async () => {
      // Não há entrada de usuário aqui: quem define conteúdo e extensão é o
      // serviço que gerou o arquivo (o PDF do certificado).
      const url = await servico.salvarArquivoGerado(
        Buffer.from('%PDF'),
        'certificados',
        '.pdf',
      );

      expect(url).toMatch(/^\/uploads\/certificados\/[0-9a-f-]{36}\.pdf$/);
      expect(armazenamento.gravar.mock.calls[0][3]).toBe('application/pdf');
    });
  });

  describe('ler', () => {
    it('decompõe a URL do banco em pasta e arquivo', async () => {
      const conteudo = await servico.ler('/uploads/certificados/abc.pdf');

      expect(conteudo?.toString()).toBe('bytes');
      expect(armazenamento.ler).toHaveBeenCalledWith('certificados', 'abc.pdf');
    });

    it.each([
      ['fora do prefixo', '/etc/passwd'],
      ['prefixo parcial', '/uploadsx/produtos/a.png'],
      ['travessia', '/uploads/produtos/../../etc/passwd'],
      ['travessia codificada', '/uploads/produtos/%2e%2e%2fcertificados/a.pdf'],
      // No Windows a barra invertida também separa diretório: sem ela na
      // separação, `produtos\..\certificados` seria UM segmento, passaria pela
      // allowlist como nome de arquivo e o driver de disco resolveria o `..`.
      ['travessia com barra invertida', '/uploads/produtos/..%5ccertificados'],
      ['pasta fora da allowlist', '/uploads/inventada/a.png'],
      ['sem arquivo', '/uploads/produtos'],
      ['subpasta', '/uploads/produtos/sub/a.png'],
      ['vazio', ''],
    ])('%s → null, sem tocar no armazenamento', async (_, url) => {
      // A URL vem do banco, e as colunas foram populadas pelo ETL do legado —
      // que aceitava o que viesse. É aqui que ela deixa de ser texto livre.
      await expect(servico.ler(url)).resolves.toBeNull();
      expect(armazenamento.ler).not.toHaveBeenCalled();
    });

    it('null quando o armazenamento não tem mais o arquivo', async () => {
      armazenamento.ler.mockResolvedValue(null);

      await expect(servico.ler('/uploads/certificados/abc.pdf')).resolves
        .toBeNull();
    });
  });

  describe('remover', () => {
    it('remove pasta e arquivo da URL', async () => {
      await servico.remover('/uploads/clientes/abc.jpg');

      expect(armazenamento.remover).toHaveBeenCalledWith('clientes', 'abc.jpg');
    });

    it.each([
      ['nula', null],
      ['indefinida', undefined],
      ['com travessia', '/uploads/produtos/../certificados/a.pdf'],
    ])('URL %s é ignorada', async (_, url) => {
      await servico.remover(url);

      expect(armazenamento.remover).not.toHaveBeenCalled();
    });
  });

  describe('substituirImagem', () => {
    it('grava a nova e remove a anterior', async () => {
      const url = await servico.substituirImagem(
        arquivo('image/jpeg', { nome: 'nova.jpg' }),
        'clientes',
        '/uploads/clientes/antiga.jpg',
      );

      expect(url).toMatch(/^\/uploads\/clientes\//);
      expect(armazenamento.remover).toHaveBeenCalledWith(
        'clientes',
        'antiga.jpg',
      );
    });

    it('não remove nada quando não havia foto anterior', async () => {
      await servico.substituirImagem(arquivo('image/jpeg'), 'clientes', null);

      expect(armazenamento.remover).not.toHaveBeenCalled();
    });

    it('falha ao gravar não remove a foto atual', async () => {
      // A ordem importa: remover primeiro deixaria o cliente sem foto nenhuma
      // se o upload da nova falhasse.
      armazenamento.gravar.mockRejectedValue(new Error('storage fora do ar'));

      await expect(
        servico.substituirImagem(
          arquivo('image/jpeg'),
          'clientes',
          '/uploads/clientes/antiga.jpg',
        ),
      ).rejects.toThrow('storage fora do ar');
      expect(armazenamento.remover).not.toHaveBeenCalled();
    });
  });
});
