// JWT 中间件 — req.user 注入
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';
import { row } from '../db/index.js';
import type { UserRole } from '@sms/shared';

export interface AuthPayload {
  sub: number;
  role: UserRole;
  email: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authRequired(req: Request, res: Response, next: NextFunction): void {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) {
    res.status(401).json({ error: '未提供 token', code: 'NO_TOKEN' });
    return;
  }
  const token = h.slice('Bearer '.length).trim();
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    // 二次校验：用户依然存在
    const u = row<{ id: number; role: string; email: string; name: string }>(
      `SELECT id, role, email, name FROM users WHERE id = ?`, payload.sub,
    );
    if (!u) {
      res.status(401).json({ error: 'token 持有者已不存在', code: 'USER_GONE' });
      return;
    }
    req.user = {
      sub: u.id,
      role: u.role as UserRole,
      email: u.email,
      name: u.name,
    };
    next();
  } catch (e) {
    res.status(401).json({ error: 'token 无效或已过期', code: 'BAD_TOKEN' });
    return;
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: '未登录' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: `需要角色：${roles.join('|')}`, code: 'ROLE_FORBIDDEN' });
      return;
    }
    next();
  };
}
