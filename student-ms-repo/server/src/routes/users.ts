// 用户列表（只读）：前端选老师时用
import { Router } from 'express';
import { rows } from '../db/index.js';
import type { User } from '@sms/shared';

export const usersRoutes = Router();

// GET /users?role=teacher
usersRoutes.get('/users', (req, res, next) => {
  try {
    const role = req.query.role as string | undefined;
    let sql = `SELECT id, name, role, email, phone, dept, created_at FROM users`;
    const params: any[] = [];
    if (role) {
      sql += ` WHERE role = ?`;
      params.push(role);
    }
    sql += ` ORDER BY name`;
    res.json({ items: rows<User>(sql, ...params) });
  } catch (e) { next(e); }
});
