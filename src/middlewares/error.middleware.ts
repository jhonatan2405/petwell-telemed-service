import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '../utils/response.util';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error('[ErrorHandler]', err.message, err.stack);
  res.status(500).json(errorResponse('Error interno del servidor', [err.message]));
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json(errorResponse(`Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}
