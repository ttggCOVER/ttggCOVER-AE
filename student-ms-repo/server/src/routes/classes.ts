// 班级 + 出勤 + 扣课时 — 老师视角
import { Router } from 'express';
import { z } from 'zod';
import { rows, row, run, tx } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import { RuleError } from '../lib/rules.js';
import type { Student } from '@sms/shared';

export const classesRoutes = Router();

// 计算 HH:MM 时间差（分钟）
function timeDiffMin(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

// ---------- GET /classes/today — 老师今日课程 ----------
// 按 Melbourne 时区 weekday 匹配 classes.weekday
classesRoutes.get('/classes/today', requireRole('teacher', 'admin'), (req, res, next) => {
  try {
    // Melbourne 今天的 weekday（0=周日 ... 6=周六）
    const melbourne = new Date().toLocaleString('en-US', { timeZone: 'Australia/Melbourne' });
    const melDate = new Date(melbourne);
    const weekday = melDate.getDay(); // 0-6
    const dateStr = `${melDate.getFullYear()}-${String(melDate.getMonth() + 1).padStart(2, '0')}-${String(melDate.getDate()).padStart(2, '0')}`;

    // 老师只看自己的课；admin 看所有
    let teacherFilter = '';
    const params: any[] = [weekday];
    if (req.user!.role === 'teacher') {
      teacherFilter = 'AND c.teacher_id = ?';
      params.push(req.user!.sub);
    }

    const classes = rows<any>(
      `SELECT c.*, u.name AS teacher_name,
         (SELECT COUNT(*) FROM class_members cm WHERE cm.class_id = c.id) AS member_count,
         (SELECT COUNT(*) FROM class_sessions cs WHERE cs.class_id = c.id AND cs.session_date = ?) AS session_today
       FROM classes c LEFT JOIN users u ON u.id = c.teacher_id
       WHERE c.weekday = ? ${teacherFilter}
       ORDER BY c.start_time ASC`,
      dateStr, ...params,
    );

    res.json({ date: dateStr, weekday, items: classes });
  } catch (e) { next(e); }
});

// ---------- GET /classes/:id/roster — 班级名单（含课时余额） ----------
classesRoutes.get('/classes/:id/roster', requireRole('teacher', 'admin'), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cls = row<any>(`SELECT c.*, u.name AS teacher_name FROM classes c LEFT JOIN users u ON u.id = c.teacher_id WHERE c.id = ?`, id);
    if (!cls) throw new RuleError('CLASS_NOT_FOUND', '班级不存在', 404);

    // R5 简化：老师只能看自己班的名单
    if (req.user!.role === 'teacher' && cls.teacher_id !== req.user!.sub) {
      throw new RuleError('ROLE_FORBIDDEN', '无权查看其他老师的班级', 403);
    }

    const members = rows<any>(
      `SELECT s.id, s.name, s.grade, s.parent_name, s.parent_phone, s.status,
              lc.balance AS lesson_balance
       FROM class_members cm
       JOIN students s ON s.id = cm.student_id
       LEFT JOIN lesson_credits lc ON lc.student_id = s.id
       WHERE cm.class_id = ?
       ORDER BY s.name ASC`,
      id,
    );

    res.json({ class: cls, members });
  } catch (e) { next(e); }
});

// ---------- POST /classes/:id/take-attendance — 登记出勤 + 扣课时 ----------
// 事务内：1) 建 class_sessions  2) 为每个学生写 attendance  3) 出席/迟到的学生扣课时
const AttendanceSchema = z.object({
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式 YYYY-MM-DD'),
  students: z.array(z.object({
    student_id: z.number().int().positive(),
    status: z.enum(['present', 'absent', 'late']),
    minutes: z.number().int().min(0).max(480).optional(), // 自定义扣减分钟，默认=课程时长
    note: z.string().max(100).optional(),
  })).min(1, '至少需要一个学生'),
});

classesRoutes.post('/classes/:id/take-attendance', requireRole('teacher', 'admin'), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const body = AttendanceSchema.parse(req.body);

    const cls = row<any>(`SELECT * FROM classes WHERE id = ?`, id);
    if (!cls) throw new RuleError('CLASS_NOT_FOUND', '班级不存在', 404);

    // 老师只能给自己班考勤
    if (req.user!.role === 'teacher' && cls.teacher_id !== req.user!.sub) {
      throw new RuleError('ROLE_FORBIDDEN', '无权给其他老师的班级考勤', 403);
    }

    const durationMin = timeDiffMin(cls.start_time, cls.end_time);

    const result = tx(() => {
      // 1. 建/复用 class_session（同一天同班只允许一条）
      const existing = row<{ id: number; status: string }>(
        `SELECT id, status FROM class_sessions WHERE class_id = ? AND session_date = ?`,
        id, body.session_date,
      );
      let sessionId: number;
      if (existing) {
        if (existing.status === 'completed') {
          throw new RuleError('SESSION_DONE', '该班级今日已完成考勤，不能重复提交', 409);
        }
        sessionId = existing.id;
        // 清掉旧 attendance（允许改）
        run(`DELETE FROM attendance WHERE session_id = ?`, sessionId);
      } else {
        const r = run(`INSERT INTO class_sessions (class_id, session_date, status) VALUES (?, ?, 'completed')`, id, body.session_date);
        sessionId = Number(r.lastInsertRowid);
      }

      let totalDeducted = 0;
      let presentCount = 0;
      const results: { student_id: number; status: string; deducted: number; balance_after: number }[] = [];

      for (const item of body.students) {
        const deductMin = item.minutes ?? durationMin;
        // 缺席不扣课时；出席/迟到扣
        const shouldDeduct = item.status === 'present' || item.status === 'late';
        const actualDeduct = shouldDeduct ? deductMin : 0;

        run(
          `INSERT INTO attendance (session_id, student_id, status, minutes_deducted, note) VALUES (?, ?, ?, ?, ?)`,
          sessionId, item.student_id, item.status, actualDeduct, item.note ?? null,
        );

        if (actualDeduct > 0) {
          // 内联扣课时（避免 consumeLesson 内部嵌套 tx）
          const before = row<{ balance: number }>(`SELECT balance FROM lesson_credits WHERE student_id = ?`, item.student_id);
          const balanceBefore = before?.balance ?? 0;
          if (balanceBefore < actualDeduct) {
            throw new RuleError('R4', `课时不足：学生 ${item.student_id} 当前余额 ${balanceBefore} 分钟，本次需扣 ${actualDeduct} 分钟`, 409);
          }
          run(`UPDATE lesson_credits SET balance = balance - ?, updated_at = datetime('now') WHERE student_id = ?`, actualDeduct, item.student_id);
          run(`INSERT INTO lesson_transactions (student_id, delta_min, reason, note) VALUES (?, ?, 'consume', ?)`,
            item.student_id, -actualDeduct, item.note ?? `${cls.name} 出勤扣课`);
          totalDeducted += actualDeduct;
          if (item.status === 'present') presentCount++;
        } else if (item.status === 'present') {
          presentCount++;
        }

        const bal = row<{ balance: number }>(`SELECT balance FROM lesson_credits WHERE student_id = ?`, item.student_id);
        results.push({
          student_id: item.student_id,
          status: item.status,
          deducted: actualDeduct,
          balance_after: bal?.balance ?? 0,
        });
      }

      return { sessionId, totalDeducted, presentCount, results };
    });

    res.status(201).json({
      session_id: result.sessionId,
      total_deducted: result.totalDeducted,
      present_count: result.presentCount,
      results: result.results,
    });
  } catch (e) { next(e); }
});

// ---------- GET /classes/:id/sessions — 班级历史出勤记录 ----------
classesRoutes.get('/classes/:id/sessions', requireRole('teacher', 'admin'), (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sessions = rows<any>(
      `SELECT cs.*,
         (SELECT COUNT(*) FROM attendance a WHERE a.session_id = cs.id) AS total,
         (SELECT COUNT(*) FROM attendance a WHERE a.session_id = cs.id AND a.status = 'present') AS present,
         (SELECT COUNT(*) FROM attendance a WHERE a.session_id = cs.id AND a.status = 'late') AS late,
         (SELECT COUNT(*) FROM attendance a WHERE a.session_id = cs.id AND a.status = 'absent') AS absent,
         (SELECT COALESCE(SUM(minutes_deducted),0) FROM attendance a WHERE a.session_id = cs.id) AS minutes_deducted
       FROM class_sessions cs
       WHERE cs.class_id = ?
       ORDER BY cs.session_date DESC LIMIT 30`,
      id,
    );
    res.json({ items: sessions });
  } catch (e) { next(e); }
});
