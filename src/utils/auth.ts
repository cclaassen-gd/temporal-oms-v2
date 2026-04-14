import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
/** Token expiry in seconds (default 24h) */
const TOKEN_EXPIRY_SECONDS = process.env.JWT_EXPIRY_SECONDS ? parseInt(process.env.JWT_EXPIRY_SECONDS, 10) : 86400;

/** Token payload stored in JWT */
export interface TokenPayload {
  sub: string; // username
  iat?: number;
  exp?: number;
}

/** Extend Express Request with optional user from JWT */
declare module 'express-serve-static-core' {
  interface Request {
    user?: TokenPayload;
  }
}

/** Extract JWT from `Authorization: Bearer <token>` (scheme is case-insensitive per common practice). */
export function parseBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) return undefined;
  const m = authorization.trim().match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || undefined;
}

/**
 * Middleware that requires a valid Bearer token.
 * Skips validation when NODE_ENV=test for easier testing.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'test') {
    next();
    return;
  }

  const token = parseBearerToken(req.headers.authorization);

  if (!token) {
    res.status(401).json({ error: 'Missing or invalid Authorization header. Use Bearer <token>.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/**
 * Generates a JWT bearer token for the given username.
 */
export function generateToken(username: string): string {
  return jwt.sign(
    { sub: username },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY_SECONDS }
  );
}

/**
 * Extracts username and password from Basic auth or JSON body.
 * Returns null if credentials are missing.
 */
export function getCredentials(req: Request): { username: string; password: string } | undefined {
  // Try Basic auth header first
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
      const [username, password] = decoded.split(':');
      if (username && password !== undefined) {
        return { username, password };
      }
      return;
    } catch {
      return;
    }
  }

  const body = req.body as { username?: string; password?: string } | undefined;
  if (body?.username && body?.password !== undefined) {
    return { username: body.username, password: body.password };
  }

  return undefined;
}

/**
 * Checks if the Accept-All header is set to allow any credentials.
 * Header: Accept-All: true (case-insensitive value)
 */
export function isAcceptAll(req: Request): boolean {
  const val = req.headers['accept-all'];
  return val === 'true' || val === '1';
}
