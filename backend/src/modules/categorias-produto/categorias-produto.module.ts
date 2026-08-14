import { Module } from '@nestjs/common';

import { CategoriasProdutoController } from './categorias-produto.controller';
import { CategoriasProdutoService } from './categorias-produto.service';

@Module({
  controllers: [CategoriasProdutoController],
  providers: [CategoriasProdutoService],
  exports: [CategoriasProdutoService],
})
export class CategoriasProdutoModule {}
