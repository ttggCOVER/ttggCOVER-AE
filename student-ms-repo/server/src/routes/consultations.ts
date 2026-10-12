// 咨询记录：列表 / 详情
import { Router } from 'express';
import { rows } from '../db/index.js';
import type { Consultation } from '@sms/shared';

export const consultationsRoutes = Router();

// GET /consultations?student_id=1
consultationsRoutes.get('/consultations', (req, res, next) => {
  try {
    const studentId = req.query.student_id ? parseInt(req.query.student_id as string, 10) : undefined;
    let sql = `SELECT c.*, u.name AS created_by_name, s.name AS student_name FROM consultations c
               LEFT JOIN users u ON u.id = c.created_by
               LEFT JOIN students s ON s.id = c.student_id`;
    const params: any[] = [];
    if (studentId) {
      sql += ` WHERE c.student_id = ?`;
      params.push(studentId);
    }
    sql += ` ORDER BY c.created_at DESC LIMIT 200`;
    const list = rows<Consultation>(sql, ...params);
    res.json({ items: list });
  } catch (e) { next(e); }
});
