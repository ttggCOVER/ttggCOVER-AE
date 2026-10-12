// AI 路由：试听反馈结构化抽取（R5 + LLM + zod + 降级 + 自动建跟进）
import { Router } from 'express';
import { row, run } from '../db/index.js';
import { requireRole } from '../middleware/auth.js';
import { assertTeacherOwnsTrial, RuleError } from '../lib/rules.js';
import { extractTrialFeedback, degradedResult } from '../lib/llm.js';
import { fromUTC, nowISO } from '../lib/timezone.js';
import type { ExtractFeedbackResponse } from '@sms/shared';

export const aiRoutes = Router();

// POST /ai/trials/:id/extract-feedback
//   老师提交反馈后 → 调用 DeepSeek 抽取结构化结果 → 存 extracted_feedback + recommendation
//   根据 recommendation 自动生成一条 follow_up（after_trial），admin 收到跟进任务
aiRoutes.post('/ai/trials/:id/extract-feedback', requireRole('teacher'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    // R5：必须是该试听老师
    assertTeacherOwnsTrial(req.user!.sub, id);

    const t = row<{
      student_id: number;
      teacher_id: number;
      feedback_text: string | null;
      status: string;
    }>(`SELECT student_id, teacher_id, feedback_text, status FROM trial_bookings WHERE id = ?`, id);

    if (!t) throw new RuleError('TRIAL_NOT_FOUND', '试听不存在', 404);
    if (!t.feedback_text || t.feedback_text.trim().length === 0) {
      throw new RuleError('NO_FEEDBACK', '请先填写试听反馈文本', 400);
    }

    // 取学生信息给 prompt
    const s = row<{ name: string; grade: string | null; owner_admin_id: number }>(
      `SELECT name, grade, owner_admin_id FROM students WHERE id = ?`, t.student_id,
    );
    if (!s) throw new RuleError('STUDENT_NOT_FOUND', '学生不存在', 404);

    // 取试听关联的科目（从班级 subject 没法直接拿，简化为"试听课"）
    const subject = '综合';

    const { result, degraded } = await extractTrialFeedback(
      s.name, s.grade, subject, t.feedback_text,
    );

    // 持久化抽取结果
    run(
      `UPDATE trial_bookings SET extracted_feedback = ?, recommendation = ? WHERE id = ?`,
      JSON.stringify(result), result.recommendation, id,
    );

    // 自动建跟进任务（除非降级 / 已有跟进）
    let followUpCreated = false;
    if (!degraded && result.recommendation !== 'enroll') {
      // not_now / reject 都需要 admin 主动跟进
      const dueAt = new Date(Date.now() + 24 * 3600_000).toISOString();
      run(
        `INSERT INTO follow_ups (student_id, type, content, next_action, due_at, owner_admin_id, trial_booking_id, created_at)
         VALUES (?, 'after_trial', ?, ?, ?, ?, ?, datetime('now'))`,
        t.student_id,
        `AI 抽取建议：${result.follow_up_suggestion}`,
        result.recommendation === 'not_now' ? '暂缓，1 周后回访' : '礼貌告知不通过',
        dueAt,
        s.owner_admin_id,
        id,
      );
      followUpCreated = true;
    }

    const resp: ExtractFeedbackResponse = {
      extracted: result,
      persisted: true,
    };
    res.json({ ...resp, followUpCreated });
  } catch (e) {
    next(e);
  }
});
