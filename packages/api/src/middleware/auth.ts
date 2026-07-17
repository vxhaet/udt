import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { TokenPayload, UserTokenPayload, ParticipantTokenPayload, RoleUser } from '@udt/shared';

// Augment Express Request
declare global {
  namespace Express {
    interface Request {
      user?: UserTokenPayload;
      participant?: ParticipantTokenPayload;
    }
  }
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
}

// Middleware : utilisateur admin avec rôles requis
export function requireUser(...roles: RoleUser[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'Token manquant' });

    try {
      const payload = verifyToken(token);
      if (payload.type !== 'user') {
        return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
      }
      if (roles.length > 0 && !roles.includes(payload.role)) {
        return res.status(403).json({ error: 'Permissions insuffisantes' });
      }
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
  };
}

// Middleware : participant authentifié
export function requireParticipant() {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'Token manquant' });

    try {
      const payload = verifyToken(token);
      if (payload.type !== 'participant') {
        return res.status(403).json({ error: 'Accès réservé aux participants' });
      }
      req.participant = payload;
      next();
    } catch {
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
  };
}

// Middleware : tout utilisateur authentifié (admin ou participant)
export function requireAuth() {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'Token manquant' });

    try {
      const payload = verifyToken(token);
      if (payload.type === 'user') req.user = payload;
      else if (payload.type === 'participant') req.participant = payload;
      next();
    } catch {
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
  };
}

// Middleware optionnel : enrichit la requête si token présent, ne bloque pas
export function optionalAuth() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (token) {
      try {
        const payload = verifyToken(token);
        if (payload.type === 'user') req.user = payload;
        else if (payload.type === 'participant') req.participant = payload;
      } catch {
        // Token invalide ignoré silencieusement
      }
    }
    next();
  };
}
