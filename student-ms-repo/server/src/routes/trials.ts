// 试听路由：安排 / 取消 / 标记完成 + 提交反馈 / 冲突预览 / 列表
import { Router } from 'express';
import { z } from 'zod';
import { rows, row, run } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import {
  assertOnlyOneCompletedTrial,
  assertNoConflictOrThrow,
  assertNoScheduleConflict,
  assertStudentNotChurned,
  assertTeacherOwnsTrial,
  RuleError,
} from '../lib/rules.js';
import { nowISO } from '../lib/timezone.js';
import type { TrialBooking, ScheduleTrialRequest, ConflictPreview, SubmitTrialFeedbackRequest } from '@sms/shared';

export const trialsRoutes = Router();

// ---------- GET /trials?today=1&teacher=me&student=1 ----------
trialsRoutes.get('/trials', (req, res, next) => {
  try {
    const where: string[] = ['1=1'];
    const params: any[] = [];
    if (req.query.today === '1') {
      // 取今日 Melbourne 0:00 - 次日 0:00（UTC 范围）
      // 简化：用 strftime 比较 scheduled_at 的 UTC 日期 = 今日 UTC 日期
      const today = new Date();
      const y = today.getUTCFullYear(); const m = String(today.getUTCMonth() + 1).padStart(2, '0'); const d = String(today.getUTCDate()).padStart(2, '0');
      const startUTC = `${y}-${m}-${d}T00:00:00.000Z`;
      const endUTC = `${y}-${m}-${d}T23:59:59.999Z`;
      where.push('t.scheduled_at >= ? AND t.scheduled_at <= ?');
      params.push(startUTC, endUTC);
    }
    if (req.query.teacher === 'me' && req.user) {
      where.push('t.teacher_id = ?'); params.push(req.user.sub);
    }
    if (req.query.student) {
      where.push('t.student_id = ?'); params.push(parseInt(req.query.student as string, 10));
    }
    if (req.query.status) {
      where.push('t.status = ?'); params.push(req.query.status as string);
    }
    const sql = `SELECT t.*, s.name AS student_name, ts.name AS teacher_name, u.name AS created_by_name
                 FROM trial_bookings t
                 LEFT JOIN students s ON s.id = t.student_id
                 LEFT JOIN users ts ON ts.id = t.teacher_id
                 LEFT JOIN users u ON u.id = t.created_by
                 WHERE ${where.join(' AND ')}
                 ORDER BY t.scheduled_at ASC LIMIT 200`;
    const items = rows<any>(sql, ...params);
    // 解析 extracted_feedback JSON 字符串为对象（前端期望对象，字符串会导致渲染崩溃）
    items.forEach((t) => {
      if (typeof t.extracted_feedback === 'string') {
        try {
          t.extracted_feedback = JSON.parse(t.extracted_feedback);
        } catch {
          t.extracted_feedback = null;
        }
      }
    });
    res.json({ items });
  } catch (e) { next(e); }
});

// ---------- POST /trials/preview-conflict — 实时冲突检测（前端用） ----------
const PreviewSchema = z.object({
  student_id: z.number().int().positive(),
  scheduled_at: z.string().datetime(),
  duration_min: z.number().int().min(15).max(240),
});

trialsRoutes.post('/trials/preview-conflict', (req, res, next) => {
  try {
    const body = PreviewSchema.parse(req.body);
    const { conflicts } = assertNoScheduleConflict(body.student_id, body.scheduled_at, body.duration_min);
    const resp: ConflictPreview = { has_conflict: conflicts.length > 0, conflicts };
    res.json(resp);
  } catch (e) { next(e); }
});

// ---------- POST /trials — 安排试听（R1 + R2 + R6 校验） ----------
const ScheduleSchema = z.object({
  student_id: z.number().int().positive(),
  teacher_id: z.number().int().positive(),
  scheduled_at: z.string().datetime(),
  duration_min: z.number().int().min(15).max(240),
}) satisfies z.ZodType<ScheduleTrialRequest>;

trialsRoutes.post('/trials', requireRole('admin'), (req, res, next) => {
  try {
    const body = ScheduleSchema.parse(req.body);
    // R6: churned 学生不能排试听
    assertStudentNotChurned(body.student_id);
    // R1: 已经有 completed 试听就不能再排（但允许再排 pending 试听？实际是同一天多节试听？业务上"试听只能一次"指 completed）
    // 这里直接拦：只要有 completed 就拒绝
    assertOnlyOneCompletedTrial(body.student_id);
    // R2: 时间冲突
    assertNoConflictOrThrow(body.student_id, body.scheduled_at, body.duration_min);

    const r = run(
      `INSERT INTO trial_bookings (student_id, teacher_id, scheduled_at, duration_min, status, created_by, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?, datetime('now'))`,
      body.student_id, body.teacher_id, body.scheduled_at, body.duration_min, req.user!.sub,
    );
    // 同步学生状态：consulting → trial_scheduled
    run(`UPDATE students SET status = 'trial_scheduled' WHERE id = ? AND status = 'consulting'`, body.student_id);
    const t = row<TrialBooking>(
      `SELECT t.*, s.name AS student_name, ts.name AS teacher_name, u.name AS created_by_name
       FROM trial_bookings t
       LEFT JOIN students s ON s.id = t.student_id
       LEFT JOIN users ts ON ts.id = t.teacher_id
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.id = ?`, Number(r.lastInsertRowid),
    );
    res.status(201).json(t);
  } catch (e) { next(e); }
});

// ---------- POST /trials/:id/cancel — 取消试听 ----------
trialsRoutes.post('/trials/:id/cancel', requireRole('admin', 'teacher'), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const t = row<{ status: string }>(`SELECT status FROM trial_bookings WHERE id = ?`, id);
    if (!t) throw new RuleError('TRIAL_NOT_FOUND', '试听不存在', 404);
    if (t.status === 'cancelled') {
      res.json({ ok: true, message: '已是取消状态' });
      return;
    }
    if (t.status === 'completed') {
      throw new RuleError('TRIAL_COMPLETED', '已完成的试听不能取消', 409);
    }
    run(`UPDATE trial_bookings SET status = 'cancelled' WHERE id = ?`, id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- POST /trials/:id/feedback — 老师提交反馈（R5 所有权校验） ----------
const FeedbackSchema = z.object({
  feedback_text: z.string().min(1).max(2000),
}) satisfies z.ZodType<SubmitTrialFeedbackRequest>;

trialsRoutes.post('/trials/:id/feedback', requireRole('teacher'), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    // R5
    assertTeacherOwnsTrial(req.user!.sub, id);

    const body = FeedbackSchema.parse(req.body);
    run(`UPDATE trial_bookings SET feedback_text = ? WHERE id = ?`, body.feedback_text, id);
    const t = row<TrialBooking>(
      `SELECT t.*, s.name AS student_name, ts.name AS teacher_name FROM trial_bookings t
       LEFT JOIN students s ON s.id = t.student_id
       LEFT JOIN users ts ON ts.id = t.teacher_id WHERE t.id = ?`, id,
    );
    res.json(t);
  } catch (e) { next(e); }
});

// ---------- POST /trials/:id/complete — 标记完成 ----------
// 老师确认试听结束。状态从 pending → completed。
// 如果学生无 completed 试听（partial unique 不冲突），允许；否则 R1 在 DB 层拦
trialsRoutes.post('/trials/:id/complete', requireRole('teacher'), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    // R5：必须是该试听老师
    assertTeacherOwnsTrial(req.user!.sub, id);

    const t = row<{ student_id: number; status: string }>(`SELECT student_id, status FROM trial_bookings WHERE id = ?`, id);
    if (!t) throw new RuleError('TRIAL_NOT_FOUND', '试听不存在', 404);
    if (t.status === 'completed') {
      res.json({ ok: true, message: '已完成' });
      return;
    }
    if (t.status === 'cancelled') {
      throw new RuleError('TRIAL_CANCELLED', '已取消的试听不能标记完成', 409);
    }

    try {
      run(`UPDATE trial_bookings SET status = 'completed' WHERE id = ?`, id);
    } catch (e: any) {
      // 命中 partial unique → R1
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new RuleError('R1', '该学生已存在 completed 试听', 409);
      }
      throw e;
    }
    // 学生状态：trial_scheduled → trial_done
    run(`UPDATE students SET status = 'trial_done' WHERE id = ? AND status IN ('trial_scheduled')`, t.student_id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
