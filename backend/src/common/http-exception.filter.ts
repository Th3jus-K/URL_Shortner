import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      // Nest turns Express body-parser SyntaxErrors (malformed JSON) and URIErrors (undecodable path such
      // as /r/%FF) into a bare 400 carrying the parser's own text; never expose that text.
      if (status === 400) {
        if (req.method === 'GET') {
          res.status(404).json({ detail: 'Short URL not found' }); // a code that cannot be decoded is unknown
        } else {
          res.status(400).json({ detail: 'Malformed request body' });
        }
        return;
      }
      res.status(status).json({ detail: messageOf(exception) });
      return;
    }

    // Express body-parser errors (e.g. malformed JSON) are not HttpExceptions.
    const err = exception as { type?: string; status?: number } | undefined;
    if (err && err.type === 'entity.parse.failed') {
      res.status(400).json({ detail: 'Malformed request body' });
      return;
    }
    if (err && err.type === 'entity.too.large') {
      res.status(413).json({ detail: 'Request body too large' });
      return;
    }

    this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    res.status(500).json({ detail: 'Internal server error' });
  }
}

function messageOf(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === 'string') return body;
  const message = (body as { message?: string | string[] }).message;
  if (Array.isArray(message)) return message[0] ?? exception.message;
  return message ?? exception.message;
}
