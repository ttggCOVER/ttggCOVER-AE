// 跟进路由：列表 / 创建 / 标记完成
import { Router } from 'express';
import { z } from 'zod';
import { rows, row, run } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import { assertFollowUpDueAfterNow, assertAdminOwnsStudent, RuleError } from '../lib/rules.js';
import { nowISO } from '../lib/timezone.js';
import type { FollowUp } from '@sms/shared';

export const followUpsRoutes = Router();

// GET /follow-ups?status=pending&owner=me&overdue=1
followUpsRoutes.get('/follow-ups', requireRole('admin'), (req, res, next) => {
  try {
    const where: string[] = ['1=1'];
    const params: any[] = [];
    if (req.query.status === 'pending') {
      where.push('f.done_at IS NULL');
    } else if (req.query.status === 'done') {
      where.push('f.done_at IS NOT NULL');
    }
    if (req.query.owner === 'me' && req.user) {
      where.push('f.owner_admin_id = ?'); params.push(req.user.sub);
    }
    if (req.query.overdue === '1') {
      where.push("f.done_at IS NULL AND f.due_at < datetime('now')");
    }
    const sql = `SELECT f.*, s.name AS student_name, u.name AS owner_admin_name
                 FROM follow_ups f
                 LEFT JOIN students s ON s.id = f.student_id
                 LEFT JOIN users u ON u.id = f.owner_admin_id
                 WHERE ${where.join(' AND ')}
                 ORDER BY (f.done_at IS NULL) DESC, f.due_at ASC LIMIT 200`;
    res.json({ items: rows<FollowUp>(sql, ...params) });
  } catch (e) { next(e); }
});

// POST /follow-ups
const CreateFuSchema = z.object({
  student_id: z.number().int().positive(),
  type: z.enum(['after_trial', 'renewal', 'churn']),
  content: z.string().min(1).max(500),
  next_action: z.string().max(200).optional(),
  due_at: z.string().datetime(),
  trial_booking_id: z.number().int().positive().optional(),
});

followUpsRoutes.post('/follow-ups', requireRole('admin'), (req, res, next) => {
  try {
    const body = CreateFuSchema.parse(req.body);
    // R3：admin 只能给自己管的学生创建跟进
    assertAdminOwnsStudent(req.user!.sub, body.student_id);
    // R7：到期时间必须晚于现在
    assertFollowUpDueAfterNow(body.due_at);

    const r = run(
      `INSERT INTO follow_ups (student_id, type, content, next_action, due_at, owner_admin_id, trial_booking_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      body.student_id, body.type, body.content, body.next_action ?? null,
      body.due_at, req.user!.sub, body.trial_booking_id ?? null,
    );
    const f = row<FollowUp>(
      `SELECT f.*, s.name AS student_name, u.name AS owner_admin_name
       FROM follow_ups f
       LEFT JOIN students s ON s.id = f.student_id
       LEFT JOIN users u ON u.id = f.owner_admin_id
       WHERE f.id = ?`, Number(r.lastInsertRowid),
    );
    res.status(201).json(f);
  } catch (e) { next(e); }
});

// POST /follow-ups/:id/done — 标记完成
followUpsRoutes.post('/follow-ups/:id/done', requireRole('admin'), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const f = row<{ owner_admin_id: number; done_at: string | null }>(
      `SELECT owner_admin_id, done_at FROM follow_ups WHERE id = ?`, id,
    );
    if (!f) throw new RuleError('FU_NOT_FOUND', '跟进不存在', 404);
    // R3：只能标记自己负责的
    if (f.owner_admin_id !== req.user!.sub) {
      throw new RuleError('R3', '只能处理自己负责的跟进', 403);
    }
    if (f.done_at) {
      res.json({ ok: true, message: '已完成' });
      return;
    }
    run(`UPDATE follow_ups SET done_at = datetime('now') WHERE id = ?`, id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
