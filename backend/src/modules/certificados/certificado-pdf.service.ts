import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';

import { urlDoPainel } from '../../common/utils/ambiente.util';

export interface DadosCertificadoPdf {
  numero: string;
  escopo: string;
  dataEmissao: Date;
  dataValidade: Date;
  emitidoPorNome: string;
  produto: string;
  produtoDescricao?: string | null;
  cliente: string;
  clienteDocumento?: string | null;
  categoria: string;
  normaReferencia?: string | null;
}

const AZUL = '#0d6efd';
const GRAFITE = '#1f2937';
const CINZA = '#6b7280';

const dataBR = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });

/**
 * Monta o PDF do certificado de conformidade.
 *
 * Isolado do serviço de domínio para que a emissão não dependa de layout: o
 * arquivo é derivado do registro e pode ser regerado a qualquer momento sem
 * tocar no banco. Por isso nada aqui consulta o Prisma — recebe os dados
 * prontos e devolve um Buffer.
 */
@Injectable()
export class CertificadoPdfService {
  constructor(private readonly config: ConfigService) {}

  gerar(dados: DadosCertificadoPdf): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 56 });
      const pedacos: Buffer[] = [];

      doc.on('data', (pedaco: Buffer) => pedacos.push(pedaco));
      doc.on('end', () => resolve(Buffer.concat(pedacos)));
      doc.on('error', reject);

      const largura = doc.page.width - doc.page.margins.left * 2;

      // --- Cabeçalho ---------------------------------------------------------
      doc
        .fillColor(AZUL)
        .fontSize(26)
        .font('Helvetica-Bold')
        .text('ProCert', { align: 'center' });

      doc
        .fillColor(CINZA)
        .fontSize(10)
        .font('Helvetica')
        .text('Organismo de Certificação de Produto', { align: 'center' });

      doc.moveDown(1.5);

      doc
        .fillColor(GRAFITE)
        .fontSize(18)
        .font('Helvetica-Bold')
        .text('CERTIFICADO DE CONFORMIDADE', { align: 'center' });

      doc.moveDown(0.4);
      doc
        .fillColor(AZUL)
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(dados.numero, { align: 'center' });

      doc.moveDown(1);
      doc
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.margins.left + largura, doc.y)
        .strokeColor(AZUL)
        .lineWidth(1.5)
        .stroke();
      doc.moveDown(1.2);

      // --- Corpo -------------------------------------------------------------
      doc
        .fillColor(GRAFITE)
        .fontSize(11)
        .font('Helvetica')
        .text(
          'A ProCert certifica que o produto abaixo identificado foi avaliado e atende aos ' +
            'requisitos aplicáveis, tendo sido aprovado em todas as etapas obrigatórias do ' +
            'processo de certificação.',
          { align: 'justify' },
        );

      doc.moveDown(1.2);

      this.linha(doc, 'Produto', dados.produto);
      if (dados.produtoDescricao) {
        this.linha(doc, 'Descrição', dados.produtoDescricao);
      }
      this.linha(doc, 'Titular', dados.cliente);
      if (dados.clienteDocumento) {
        this.linha(doc, 'CNPJ/CPF', dados.clienteDocumento);
      }
      this.linha(doc, 'Categoria', dados.categoria);
      if (dados.normaReferencia) {
        this.linha(doc, 'Norma de referência', dados.normaReferencia);
      }
      this.linha(doc, 'Escopo da certificação', dados.escopo);

      doc.moveDown(0.8);
      this.linha(doc, 'Data de emissão', dataBR.format(dados.dataEmissao));
      this.linha(doc, 'Válido até', dataBR.format(dados.dataValidade));

      doc.moveDown(2);

      // --- Assinatura --------------------------------------------------------
      const yAssinatura = doc.y + 30;
      const larguraLinha = 240;
      const xLinha = doc.page.margins.left + (largura - larguraLinha) / 2;

      doc
        .moveTo(xLinha, yAssinatura)
        .lineTo(xLinha + larguraLinha, yAssinatura)
        .strokeColor(CINZA)
        .lineWidth(0.8)
        .stroke();

      doc
        .fillColor(GRAFITE)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(dados.emitidoPorNome, xLinha, yAssinatura + 6, {
          width: larguraLinha,
          align: 'center',
        });

      doc
        .fillColor(CINZA)
        .fontSize(9)
        .font('Helvetica')
        .text('Responsável pela decisão de certificação', xLinha, doc.y + 2, {
          width: larguraLinha,
          align: 'center',
        });

      // --- Rodapé ------------------------------------------------------------
      const url = urlDoPainel(this.config);
      doc
        .fillColor(CINZA)
        .fontSize(8)
        .text(
          `A validade e a situação deste certificado podem ser verificadas em ${url} ` +
            `pelo número ${dados.numero}.`,
          doc.page.margins.left,
          doc.page.height - doc.page.margins.bottom - 24,
          { width: largura, align: 'center' },
        );

      doc.end();
    });
  }

  /** Par rótulo/valor com o rótulo em negrito, na mesma linha. */
  private linha(doc: PDFKit.PDFDocument, rotulo: string, valor: string): void {
    doc
      .fillColor(CINZA)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(`${rotulo}: `, { continued: true })
      .fillColor(GRAFITE)
      .font('Helvetica')
      .text(valor);
    doc.moveDown(0.35);
  }
}
