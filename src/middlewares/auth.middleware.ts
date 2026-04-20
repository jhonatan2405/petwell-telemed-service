import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../utils/jwt.util';
import { errorResponse } from '../utils/response.util';

// Extend Express Request type to include the user payload
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json(errorResponse('No autenticado: token no proporcionado'));
    return;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    res.status(401).json(errorResponse('No autenticado: token vacío'));
    return;
  }

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json(errorResponse('No autenticado: token inválido o expirado'));
  }
}

/**
 * Authorize middleware factory — checks that the request user has one of the allowed roles.
 */
export function authorize(...roles: JwtPayload['role'][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json(errorResponse('No autenticado'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json(errorResponse('Sin permisos para realizar esta acción'));
      return;
    }
    next();
  };
}
