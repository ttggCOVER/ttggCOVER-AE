// 学生路由：列表（带漏斗统计） / 详情（带时间线）/ 创建 / 更新（R3 权限校验）
import { Router } from 'express';
import { z } from 'zod';
import { rows, row, run, tx } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import { assertAdminOwnsStudent, RuleError, consumeLesson } from '../lib/rules.js';
import { fromUTC, fmtDisplay } from '../lib/timezone.js';
import type { Student, FunnelStats, CreateConsultationRequest, Consultation } from '@sms/shared';

export const studentsRoutes = Router();

// ---------- GET /students — 列表 ----------
// 支持 ?status=consulting&owner=me&keyword=张 查询参数
studentsRoutes.get('/students', (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const owner = req.query.owner as string | undefined; // 'me' 或具体 admin id
    const keyword = (req.query.keyword as string | undefined)?.trim();

    const where: string[] = ['1=1'];
    const params: any[] = [];
    if (status) { where.push('s.status = ?'); params.push(status); }
    if (owner === 'me' && req.user?.role === 'admin') { where.push('s.owner_admin_id = ?'); params.push(req.user.sub); }
    if (owner && owner !== 'me') { where.push('s.owner_admin_id = ?'); params.push(parseInt(owner, 10)); }
    if (keyword) { where.push('(s.name LIKE ? OR s.parent_name LIKE ? OR s.parent_phone LIKE ?)'); const k = `%${keyword}%`; params.push(k, k, k); }

    const sql = `SELECT s.*, u.name AS owner_admin_name
                 FROM students s LEFT JOIN users u ON u.id = s.owner_admin_id
                 WHERE ${where.join(' AND ')}
                 ORDER BY s.created_at DESC LIMIT 200`;
    const list = rows<Student>(sql, ...params);
    res.json({ items: list });
  } catch (e) { next(e); }
});

// ---------- GET /students/funnel — 漏斗统计（admin 首页） ----------
studentsRoutes.get('/students/funnel', requireRole('admin'), (req, res, next) => {
  try {
    // 全部按 owner_admin_id = 当前 admin 过滤，保证工作台数字与点进去的列表数字一致
    const adminId = req.user!.sub;
    const counts = rows<{ status: string; cnt: number }>(
      `SELECT status, COUNT(*) cnt FROM students WHERE owner_admin_id = ? GROUP BY status`,
      adminId,
    );
    const map: Record<string, number> = { consulting: 0, trial_scheduled: 0, trial_done: 0, enrolled: 0, churned: 0 };
    for (const c of counts) map[c.status] = c.cnt;
    const lowCredit = row<{ cnt: number }>(
      `SELECT COUNT(*) cnt FROM lesson_credits lc JOIN students s ON s.id = lc.student_id
       WHERE lc.balance < 60 AND s.owner_admin_id = ?`,
      adminId,
    )!.cnt;
    const overdueFollowups = row<{ cnt: number }>(
      `SELECT COUNT(*) cnt FROM follow_ups WHERE done_at IS NULL AND due_at < datetime('now') AND owner_admin_id = ?`,
      adminId,
    )!.cnt;
    const stats: FunnelStats = {
      consulting: map.consulting,
      trial_scheduled: map.trial_scheduled,
      trial_done: map.trial_done,
      enrolled: map.enrolled,
      churned: map.churned,
      low_credit: lowCredit,
      overdue_followups: overdueFollowups,
    };
    res.json(stats);
  } catch (e) { next(e); }
});

// ---------- GET /students/low-credit — 课时预警学生 ----------
studentsRoutes.get('/students/low-credit', requireRole('admin'), (req, res, next) => {
  try {
    const list = rows<Student>(
      `SELECT s.*, u.name AS owner_admin_name, lc.balance
       FROM students s
       JOIN lesson_credits lc ON lc.student_id = s.id
       LEFT JOIN users u ON u.id = s.owner_admin_id
       WHERE s.status = 'enrolled' AND lc.balance < 120 AND s.owner_admin_id = ?
       ORDER BY lc.balance ASC`,
      req.user!.sub,
    );
    res.json({ items: list });
  } catch (e) { next(e); }
});

// ---------- GET /students/:id — 详情 + 时间线 ----------
studentsRoutes.get('/students/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const s = row<Student>(
      `SELECT s.*, u.name AS owner_admin_name
       FROM students s LEFT JOIN users u ON u.id = s.owner_admin_id WHERE s.id = ?`, id,
    );
    if (!s) throw new RuleError('STUDENT_NOT_FOUND', '学生不存在', 404);
    // 时间线：按 created_at 升序聚合咨询、试听、跟进
    const consultations = rows<Consultation>(
      `SELECT c.*, u.name AS created_by_name FROM consultations c LEFT JOIN users u ON u.id = c.created_by WHERE c.student_id = ? ORDER BY c.created_at`, id,
    );
    const trials = rows<any>(
      `SELECT t.*, u.name AS teacher_name FROM trial_bookings t LEFT JOIN users u ON u.id = t.teacher_id WHERE t.student_id = ? ORDER BY t.scheduled_at`, id,
    );
    const followUps = rows<any>(
      `SELECT f.*, u.name AS owner_admin_name FROM follow_ups f LEFT JOIN users u ON u.id = f.owner_admin_id WHERE f.student_id = ? ORDER BY f.due_at`, id,
    );
    const credits = row<{ balance: number, updated_at: string }>(
      `SELECT balance, updated_at FROM lesson_credits WHERE student_id = ?`, id,
    );
    // 课时消耗统计：总购入 / 总消耗 / 消耗率 / 最近 10 条交易
    const stats = row<{ purchased: number, consumed: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN reason='purchase' THEN delta_min ELSE 0 END), 0) AS purchased,
         COALESCE(SUM(CASE WHEN reason='consume' THEN -delta_min ELSE 0 END), 0) AS consumed
       FROM lesson_transactions WHERE student_id = ?`, id,
    );
    const purchased = stats?.purchased ?? 0;
    const consumed = stats?.consumed ?? 0;
    const balance = credits?.balance ?? 0;
    const consumptionRate = purchased > 0 ? Math.round((consumed / purchased) * 100) : 0;
    const recentTxs = rows<{ id: number; delta_min: number; reason: string; note: string | null; created_at: string }>(
      `SELECT id, delta_min, reason, note, created_at FROM lesson_transactions WHERE student_id = ? ORDER BY created_at DESC LIMIT 10`, id,
    );
    res.json({
      student: s,
      timeline: { consultations, trials, followUps },
      lesson: credits ? {
        balance,
        updated_at: credits.updated_at,
        total_purchased: purchased,
        total_consumed: consumed,
        consumption_rate: consumptionRate,
        recent_transactions: recentTxs,
      } : null,
    });
  } catch (e) { next(e); }
});

// ---------- POST /students — 登记咨询（同时建学生+咨询记录） ----------
const CreateConsultationSchema = z.object({
  student_name: z.string().min(1).max(50),
  parent_name: z.string().min(1).max(50),
  // 中国大陆手机号：11 位、1 开头、第二位 3-9
  parent_phone: z.string().regex(/^1[3-9]\d{9}$/, '家长电话必须是 11 位中国大陆手机号（1 开头）').optional(),
  grade: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
  channel: z.enum(['wechat', 'call', 'walkin']),
  source: z.string().max(100).optional(),
  need: z.string().max(200).optional(),
  owner_admin_id: z.number().int().positive().optional(), // 默认当前 admin
});

studentsRoutes.post('/students', requireRole('admin'), (req, res, next) => {
  try {
    const body = CreateConsultationSchema.parse(req.body) as CreateConsultationRequest & { owner_admin_id?: number };
    const ownerAdminId = body.owner_admin_id ?? req.user!.sub;

    const r = run(
      `INSERT INTO students (name, parent_name, parent_phone, grade, status, owner_admin_id, notes, created_at)
       VALUES (?, ?, ?, ?, 'consulting', ?, ?, datetime('now'))`,
      body.student_name, body.parent_name, body.parent_phone ?? null,
      body.grade ?? null, ownerAdminId, body.notes ?? null,
    );
    const studentId = Number(r.lastInsertRowid);

    run(
      `INSERT INTO consultations (student_id, channel, source, need, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      studentId, body.channel, body.source ?? null, body.need ?? null, req.user!.sub,
    );

    const s = row<Student>(
      `SELECT s.*, u.name AS owner_admin_name FROM students s LEFT JOIN users u ON u.id = s.owner_admin_id WHERE s.id = ?`, studentId,
    );
    res.status(201).json(s);
  } catch (e) { next(e); }
});

// ---------- PATCH /students/:id — 更新（R3 严格校验） ----------
const PatchStudentSchema = z.object({
  status: z.enum(['consulting', 'trial_scheduled', 'trial_done', 'enrolled', 'churned']).optional(),
  parent_phone: z.string().regex(/^1[3-9]\d{9}$/, '家长电话必须是 11 位中国大陆手机号（1 开头）').optional(),
  grade: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
  owner_admin_id: z.number().int().positive().optional(),
});

studentsRoutes.patch('/students/:id', requireRole('admin'), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    // R3：admin 只能修改归属自己的学生
    assertAdminOwnsStudent(req.user!.sub, id);

    const body = PatchStudentSchema.parse(req.body);
    const sets: string[] = [];
    const params: any[] = [];
    if (body.status) { sets.push('status = ?'); params.push(body.status); }
    if (body.parent_phone !== undefined) { sets.push('parent_phone = ?'); params.push(body.parent_phone); }
    if (body.grade !== undefined) { sets.push('grade = ?'); params.push(body.grade); }
    if (body.notes !== undefined) { sets.push('notes = ?'); params.push(body.notes); }
    if (body.owner_admin_id !== undefined) { sets.push('owner_admin_id = ?'); params.push(body.owner_admin_id); }
    if (sets.length === 0) {
      res.status(400).json({ error: '没有可更新字段', code: 'NO_FIELDS' });
      return;
    }
    params.push(id);
    run(`UPDATE students SET ${sets.join(', ')} WHERE id = ?`, ...params);
    const s = row<Student>(`SELECT s.*, u.name AS owner_admin_name FROM students s LEFT JOIN users u ON u.id = s.owner_admin_id WHERE s.id = ?`, id);
    res.json(s);
  } catch (e) { next(e); }
});

// ---------- POST /students/:id/enroll — 确认报名 ----------
// 业务规则：必须是 trial_done 状态才能报名（先试听 → 再报名）
// 事务内：1) 改状态为 enrolled  2) 初始化 lesson_credits 余额（可选首次购课）  3) 自动建一条 30 天后续费跟进任务
const EnrollSchema = z.object({
  initial_minutes: z.number().int().min(0).max(6000).optional().default(0), // 首次购课分钟数，0 表示只建档不购课
  note: z.string().max(200).optional(),
});

const ConsumeLessonSchema = z.object({
  minutes: z.number().int().positive('消耗分钟数必须为正整数').max(480, '单次消耗不超过 480 分钟（8 小时）'),
  note: z.string().max(200).optional(),
});

studentsRoutes.post('/students/:id/enroll', requireRole('admin'), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    // R3：admin 只能操作归属自己的学生
    assertAdminOwnsStudent(req.user!.sub, id);

    const body = EnrollSchema.parse(req.body) as { initial_minutes: number; note?: string };

    // 业务规则：必须先试听完成才能报名（不能从 consulting 跳过试听直接报名）
    const cur = row<{ status: string; name: string }>(`SELECT status, name FROM students WHERE id = ?`, id);
    if (!cur) throw new RuleError('STUDENT_NOT_FOUND', '学生不存在', 404);
    if (cur.status === 'enrolled') {
      throw new RuleError('ENROLL_ALREADY', '该学生已报名，无需重复操作', 409);
    }
    if (cur.status !== 'trial_done') {
      throw new RuleError('ENROLL_PRECONDITION', `报名前必须先完成试听（当前状态：${cur.status}）`, 409);
    }

    // 事务：改状态 + 初始化/累加课时余额 + 建续费跟进
    const result = tx(() => {
      run(`UPDATE students SET status = 'enrolled' WHERE id = ?`, id);

      if (body.initial_minutes > 0) {
        run(`INSERT INTO lesson_credits (student_id, balance, updated_at) VALUES (?, ?, datetime('now'))
             ON CONFLICT(student_id) DO UPDATE SET balance = balance + excluded.balance, updated_at = datetime('now')`,
          id, body.initial_minutes);
        run(`INSERT INTO lesson_transactions (student_id, delta_min, reason, note) VALUES (?, ?, 'purchase', ?)`,
          id, body.initial_minutes, body.note ?? '报名建档首次购课');
      } else {
        // 即使不购课，也建一条 balance=0 的 lesson_credits 记录，方便后续扣减逻辑统一处理
        run(`INSERT OR IGNORE INTO lesson_credits (student_id, balance, updated_at) VALUES (?, 0, datetime('now'))`, id);
      }

      // 自动建一条 30 天后的「续费」跟进任务
      const renewalDueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      run(`INSERT INTO follow_ups (student_id, type, content, next_action, due_at, owner_admin_id, created_at)
           VALUES (?, 'renewal', ?, '提醒家长续费 / 跟进课时消耗', ?, ?, datetime('now'))`,
        id, `学生 ${cur.name} 已报名，首次购课 ${body.initial_minutes} 分钟。30 天后提醒续费。`, renewalDueAt, req.user!.sub);

      return { renewal_due_at: renewalDueAt };
    });

    const s = row<Student>(`SELECT s.*, u.name AS owner_admin_name FROM students s LEFT JOIN users u ON u.id = s.owner_admin_id WHERE s.id = ?`, id);
    res.status(201).json({ student: s, initial_minutes: body.initial_minutes, renewal_due_at: result.renewal_due_at });
  } catch (e) { next(e); }
});

// ---------- POST /students/:id/consume-lesson — 登记课时消耗 ----------
// R3：admin 只能操作归属自己的学生
// 业务规则：学生必须是 enrolled 状态才能消耗课时
// 调用 consumeLesson（R4 余额校验 + 写 lesson_transactions）
studentsRoutes.post('/students/:id/consume-lesson', requireRole('admin'), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const body = ConsumeLessonSchema.parse(req.body);

    // R3：admin 只能操作归属自己的学生
    assertAdminOwnsStudent(req.user!.sub, id);

    const cur = row<{ id: number; name: string; status: string }>(`SELECT id, name, status FROM students WHERE id = ?`, id);
    if (!cur) throw new RuleError('STUDENT_NOT_FOUND', '学生不存在', 404);
    if (cur.status !== 'enrolled') {
      throw new RuleError('CONSUME_PRECONDITION', `学生状态为「${cur.status}」，只有已报名学生才能登记课时消耗`, 409);
    }

    // R4：余额校验 + 写交易记录（consumeLesson 内部用事务）
    consumeLesson(id, -body.minutes, null, body.note ?? null);

    const after = row<{ balance: number }>(`SELECT balance FROM lesson_credits WHERE student_id = ?`, id);
    res.status(201).json({
      consumed: body.minutes,
      balance: after?.balance ?? 0,
      student_id: id,
    });
  } catch (e) { next(e); }
});

// ---------- DELETE /students/:id — 删除学生（级联清理所有关联数据） ----------
// R3：admin 只能删除归属自己的学生
// 事务内按顺序清理：follow_ups → lesson_transactions → lesson_credits → class_members → trial_bookings → consultations → students
// 注意：trial_bookings 表的外键没有 ON DELETE CASCADE，必须手动先删
studentsRoutes.delete('/students/:id', requireRole('admin'), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    // R3：admin 只能删除归属自己的学生
    assertAdminOwnsStudent(req.user!.sub, id);

    // 校验学生存在
    const cur = row<{ id: number; name: string; status: string }>(`SELECT id, name, status FROM students WHERE id = ?`, id);
    if (!cur) throw new RuleError('STUDENT_NOT_FOUND', '学生不存在', 404);

    // 事务内级联清理
    const stats = tx(() => {
      // 统计将删除的关联数据，便于前端提示
      const counts = {
        follow_ups: Number(row<{ c: number }>(`SELECT COUNT(*) AS c FROM follow_ups WHERE student_id = ?`, id)?.c ?? 0),
        trials: Number(row<{ c: number }>(`SELECT COUNT(*) AS c FROM trial_bookings WHERE student_id = ?`, id)?.c ?? 0),
        consultations: Number(row<{ c: number }>(`SELECT COUNT(*) AS c FROM consultations WHERE student_id = ?`, id)?.c ?? 0),
        lesson_txs: Number(row<{ c: number }>(`SELECT COUNT(*) AS c FROM lesson_transactions WHERE student_id = ?`, id)?.c ?? 0),
        class_memberships: Number(row<{ c: number }>(`SELECT COUNT(*) AS c FROM class_members WHERE student_id = ?`, id)?.c ?? 0),
      };

      // 先删没有 ON DELETE CASCADE 的 trial_bookings（手动）
      run(`DELETE FROM trial_bookings WHERE student_id = ?`, id);
      // 其余表 schema 已配 ON DELETE CASCADE，但为保险起见显式删一遍
      run(`DELETE FROM follow_ups WHERE student_id = ?`, id);
      run(`DELETE FROM lesson_transactions WHERE student_id = ?`, id);
      run(`DELETE FROM lesson_credits WHERE student_id = ?`, id);
      run(`DELETE FROM class_members WHERE student_id = ?`, id);
      run(`DELETE FROM consultations WHERE student_id = ?`, id);
      // 最后删学生本体
      run(`DELETE FROM students WHERE id = ?`, id);

      return counts;
    });

    res.json({ deleted: true, id, name: cur.name, cascaded: stats });
  } catch (e) { next(e); }
});
