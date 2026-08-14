import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

interface RespostaErro {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
}

/**
 * Padroniza o corpo de todo erro da API e evita vazamento de detalhes internos.
 * (No legado, uma falha de conexão imprimia host e usuário do banco na tela.)
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Erro interno no servidor.';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const corpo = exception.getResponse();
      if (typeof corpo === 'string') {
        message = corpo;
      } else {
        const objeto = corpo as { message?: string | string[]; error?: string };
        message = objeto.message ?? exception.message;
        error = objeto.error ?? exception.name;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          status = HttpStatus.CONFLICT;
          const campos = (exception.meta?.target as string[] | undefined) ?? [];
          message = campos.length
            ? `Já existe um registro com este valor em: ${campos.join(', ')}.`
            : 'Registro duplicado.';
          error = 'Conflict';
          break;
        }
        case 'P2003':
          status = HttpStatus.CONFLICT;
          message =
            'Não é possível concluir: o registro está vinculado a outros dados.';
          error = 'Conflict';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Registro não encontrado.';
          error = 'Not Found';
          break;
        default:
          this.logger.error(`Prisma ${exception.code}`, exception.message);
      }
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const corpo: RespostaErro = {
      statusCode: status,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(corpo);
  }
}
