// POST /api/auth/login — JWT 登录
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../env.js';
import { row } from '../db/index.js';
import type { LoginResponse } from '@sms/shared';

export const authRoutes = Router();

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRoutes.post('/login', (req, res, next) => {
  try {
    const body = LoginSchema.parse(req.body);
    const u = row<{ id: number; name: string; role: string; email: string; password_hash: string; dept: string | null; created_at: string }>(
      `SELECT id, name, role, email, password_hash, dept, created_at FROM users WHERE email = ?`,
      body.email,
    );
    if (!u || !bcrypt.compareSync(body.password, u.password_hash)) {
      res.status(401).json({ error: '邮箱或密码错误', code: 'BAD_CREDENTIALS' });
      return;
    }
    const payload = { sub: u.id, role: u.role, email: u.email, name: u.name };
    const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as any });
    const resp: LoginResponse = {
      token,
      user: { id: u.id, name: u.name, role: u.role as any, email: u.email, dept: u.dept, created_at: u.created_at },
    };
    res.json(resp);
  } catch (e) {
    next(e);
  }
});
