// 业务规则：服务端强制执行 — 作业明确要求"绕过界面也拦得住"
import { db, row, rows, run, tx } from '../db/index.js';
import { DateTime, Interval } from 'luxon';
import { fromUTC, intervalsOverlap, weekdayTimeThisWeek, nowISO } from './timezone.js';
import type { StudentStatus, TrialStatus } from '@sms/shared';

// ---------- 错误类：带规则编号，方便响应回前端 ----------
export class RuleError extends Error {
  constructor(
    public rule: string,
    message: string,
    public status: number = 409,
  ) {
    super(message);
    this.name = 'RuleError';
  }
}

// R1：同一学生只能有 1 条 status='completed' 的试听
export function assertOnlyOneCompletedTrial(studentId: number): void {
  const existing = row<{ cnt: number }>(
    `SELECT COUNT(*) cnt FROM trial_bookings WHERE student_id = ? AND status = 'completed'`,
    studentId,
  );
  if (existing && existing.cnt > 0) {
    throw new RuleError('R1', '该学生已有一节已完成的试听，不允许再安排', 409);
  }
}

// R2：排课时间冲突
//   - 试听 vs 已有 trial_bookings（status != cancelled）
//   - 试听 vs 已加入的固定班级（当周对应 weekday）
export function assertNoScheduleConflict(
  studentId: number,
  scheduledAt: string,
  durationMin: number,
  excludeTrialId?: number,
): { conflicts: Array<{ type: 'trial' | 'class'; description: string }> } {
  const start = fromUTC(scheduledAt);
  const end = start.plus({ minutes: durationMin });
  const conflicts: Array<{ type: 'trial' | 'class'; description: string }> = [];

  // 1. 试听冲突
  const trialRows = rows<{ id: number; student_id: number; scheduled_at: string; duration_min: number; status: string }>(
    `SELECT id, student_id, scheduled_at, duration_min, status FROM trial_bookings
     WHERE student_id = ? AND status != 'cancelled' AND id != ?`,
    studentId,
    excludeTrialId ?? -1,
  );
  for (const t of trialRows) {
    const tStart = fromUTC(t.scheduled_at);
    const tEnd = tStart.plus({ minutes: t.duration_min });
    if (intervalsOverlap(start, end, tStart, tEnd)) {
      conflicts.push({
        type: 'trial',
        description: `与已有试听 #${t.id}（${tStart.toFormat('MM-dd HH:mm')} - ${tEnd.toFormat('HH:mm')}, ${t.status}）冲突`,
      });
    }
  }

  // 2. 班级冲突（固定班级是每周一次，跟试听时间在"当周对应 weekday"重叠才冲突）
  const classRows = rows<{ class_id: number; student_id: number; weekday: number; start_time: string; end_time: string; class_name: string; teacher_name: string }>(
    `SELECT cm.class_id, cm.student_id, c.weekday, c.start_time, c.end_time, c.name class_name, u.name teacher_name
     FROM class_members cm
     JOIN classes c ON c.id = cm.class_id
     JOIN users u ON u.id = c.teacher_id
     WHERE cm.student_id = ?`,
    studentId,
  );
  for (const c of classRows) {
    // 当周对应 weekday 的具体时间
    const cStart = weekdayTimeThisWeek(c.weekday, c.start_time, start);
    const [h, m] = c.end_time.split(':').map(Number);
    const cEnd = cStart.set({ hour: h, minute: m });
    // 班级时间是"本周那天的某段"，试听可能跨周
    // 判定方式：把试听 [start, end] 与本周班级区间比较；如果试听横跨下一周也判下一周
    if (intervalsOverlap(start, end, cStart, cEnd)) {
      conflicts.push({
        type: 'class',
        description: `与固定班级「${c.class_name}」（${c.teacher_name}老师 ${c.start_time}-${c.end_time}）冲突`,
      });
    } else {
      // 试听可能落在下一周
      const cStartNext = cStart.plus({ weeks: 1 });
      const cEndNext = cStartNext.set({ hour: h, minute: m });
      if (intervalsOverlap(start, end, cStartNext, cEndNext)) {
        conflicts.push({
          type: 'class',
          description: `与固定班级「${c.class_name}」（${c.teacher_name}老师 ${c.start_time}-${c.end_time}，下周）冲突`,
        });
      }
    }
  }

  return { conflicts };
}

export function assertNoConflictOrThrow(studentId: number, scheduledAt: string, durationMin: number, excludeTrialId?: number): void {
  const { conflicts } = assertNoScheduleConflict(studentId, scheduledAt, durationMin, excludeTrialId);
  if (conflicts.length > 0) {
    throw new RuleError('R2', `排课冲突：${conflicts.map(c => c.description).join('; ')}`, 409);
  }
}

// R3：admin 权限隔离 — 可查看所有学生，但只能修改自己的学生
export function assertAdminOwnsStudent(adminId: number, studentId: number): void {
  const s = row<{ owner_admin_id: number }>(`SELECT owner_admin_id FROM students WHERE id = ?`, studentId);
  if (!s) {
    throw new RuleError('R3', '学生不存在', 404);
  }
  if (s.owner_admin_id !== adminId) {
    throw new RuleError('R3', '只能修改归属自己（owner_admin_id）的学生', 403);
  }
}

// R4：课时扣减 — 用事务 + DB CHECK 兜底防透支
export function consumeLesson(studentId: number, deltaMin: number, refClassSessionId: number | null, note: string | null): void {
  if (deltaMin >= 0) throw new Error('consumeLesson: delta 必须为负数');
  tx(() => {
    const before = row<{ balance: number }>(`SELECT balance FROM lesson_credits WHERE student_id = ?`, studentId);
    const balanceBefore = before?.balance ?? 0;
    if (balanceBefore + deltaMin < 0) {
      throw new RuleError('R4', `课时不足：当前余额 ${balanceBefore} 分钟，本次需扣 ${-deltaMin} 分钟`, 409);
    }
    // 更新余额（CHECK 约束兜底）
    run(`UPDATE lesson_credits SET balance = balance + ?, updated_at = datetime('now') WHERE student_id = ?`,
      deltaMin, studentId);
    run(`INSERT INTO lesson_transactions (student_id, delta_min, reason, ref_class_session_id, note) VALUES (?, ?, 'consume', ?, ?)`,
      studentId, deltaMin, refClassSessionId, note);
  });
}

// 购入课时
export function purchaseLesson(studentId: number, minutes: number, note: string | null): void {
  if (minutes <= 0) throw new Error('purchaseLesson: minutes 必须为正数');
  tx(() => {
    run(`INSERT INTO lesson_credits (student_id, balance, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(student_id) DO UPDATE SET balance = balance + excluded.balance, updated_at = datetime('now')`,
      studentId, minutes);
    run(`INSERT INTO lesson_transactions (student_id, delta_min, reason, note) VALUES (?, ?, 'purchase', ?)`,
      studentId, minutes, note);
  });
}

// R5：试听反馈只能由 trial_bookings.teacher_id = req.user.id 的老师提交
export function assertTeacherOwnsTrial(teacherId: number, trialId: number): void {
  const t = row<{ teacher_id: number; status: string }>(`SELECT teacher_id, status FROM trial_bookings WHERE id = ?`, trialId);
  if (!t) throw new RuleError('R5', '试听不存在', 404);
  if (t.teacher_id !== teacherId) {
    throw new RuleError('R5', '只有该试听安排的老师才能提交反馈', 403);
  }
  if (t.status === 'cancelled') {
    throw new RuleError('R5', '已取消的试听不能提交反馈', 409);
  }
}

// R6：流失学生不允许再排试听/进班
export function assertStudentNotChurned(studentId: number): void {
  const s = row<{ status: string }>(`SELECT status FROM students WHERE id = ?`, studentId);
  if (!s) throw new RuleError('R6', '学生不存在', 404);
  if (s.status === 'churned') {
    throw new RuleError('R6', '流失学生不能安排试听', 409);
  }
}

// R7：跟进 due_at 必须晚于当前时间（新建时）
export function assertFollowUpDueAfterNow(dueAt: string): void {
  const due = fromUTC(dueAt);
  const now = DateTime.utc();
  if (due <= now) {
    throw new RuleError('R7', `跟进到期时间必须晚于当前时间`, 400);
  }
}
