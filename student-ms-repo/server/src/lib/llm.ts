// DeepSeek LLM 客户端 — structured output + zod 校验 + 失败降级
// 作业要求：放在真正省人力的地方；服务端校验；失败时合理降级
import { z } from 'zod';
import { env } from '../env.js';
import type { ExtractedFeedback } from '@sms/shared';

// zod schema：试听反馈结构化结果
export const TrialFeedbackSchema = z.object({
  engagement: z.enum(['high', 'medium', 'low']),
  strengths: z.array(z.string()).max(3),
  weaknesses: z.array(z.string()).max(3),
  recommendation: z.enum(['enroll', 'not_now', 'reject']),
  follow_up_suggestion: z.string().max(200),
});
export type TrialFeedbackLLM = z.infer<typeof TrialFeedbackSchema>;

// 降级返回值 — 任何失败都返回这个，HTTP 200 + _degraded:true
export function degradedResult(reason: string): ExtractedFeedback {
  return {
    engagement: 'medium',
    strengths: [],
    weaknesses: [],
    recommendation: 'pending',
    follow_up_suggestion: '请人工跟进：本次 AI 抽取失败，由 admin 手动判定试听结果。',
    _degraded: true,
    // reason 不对外，仅日志
  } as ExtractedFeedback & { _reason: string };
}

const SYSTEM_PROMPT = `你是一位教育机构的资深课程顾问。请阅读老师的试听反馈，抽取结构化信息。

严格输出 JSON，字段：
- engagement: 'high' | 'medium' | 'low'（学生课堂参与度）
- strengths: 最多 3 条学生的优势（每条 ≤ 30 字）
- weaknesses: 最多 3 条待改进（每条 ≤ 30 字）
- recommendation: 'enroll'（推荐报名） | 'not_now'（暂缓，需后续观察） | 'reject'（不建议报名）
- follow_up_suggestion: 给 admin 的跟进建议（≤ 200 字，要具体、可执行）

只输出 JSON，不要任何前后缀文字、不要 \`\`\` 包裹。`;

interface DeepSeekResponse {
  choices: Array<{ message: { content: string } }>;
}

export async function extractTrialFeedback(
  studentName: string,
  grade: string | null,
  subject: string,
  feedbackText: string,
): Promise<{ result: ExtractedFeedback; degraded: boolean; reason?: string }> {
  // 没配 key → 直接降级
  if (!env.DEEPSEEK_API_KEY) {
    return {
      result: degradedResult('DEEPSEEK_API_KEY 未配置'),
      degraded: true,
      reason: 'NO_API_KEY',
    };
  }

  // 反例保护：反馈文本过短就直接降级，不浪费 token
  if (feedbackText.trim().length < 10) {
    return {
      result: degradedResult('反馈文本过短，无法可靠抽取'),
      degraded: true,
      reason: 'FEEDBACK_TOO_SHORT',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s 超时

  try {
    const resp = await fetch(`${env.DEEPSEEK_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `学生：${studentName}（年级：${grade ?? '未知'}）\n科目：${subject}\n老师反馈：\n${feedbackText}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 600,
        response_format: { type: 'json_object' }, // DeepSeek 支持 JSON mode
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      return {
        result: degradedResult(`DeepSeek HTTP ${resp.status}: ${txt.slice(0, 200)}`),
        degraded: true,
        reason: `HTTP_${resp.status}`,
      };
    }

    const data = (await resp.json()) as DeepSeekResponse;
    const raw = data.choices?.[0]?.message?.content ?? '';
    if (!raw) {
      return { result: degradedResult('LLM 返回为空'), degraded: true, reason: 'EMPTY' };
    }

    // 提取 JSON（容错：去除可能的 markdown 代码块）
    let jsonStr = raw.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      return { result: degradedResult('LLM 返回的不是合法 JSON'), degraded: true, reason: 'PARSE_FAIL' };
    }

    // zod 严格校验
    const v = TrialFeedbackSchema.safeParse(parsed);
    if (!v.success) {
      return {
        result: degradedResult(`zod 校验失败：${v.error.issues.map(i => i.path.join('.') + ':' + i.message).join('; ')}`),
        degraded: true,
        reason: 'SCHEMA_FAIL',
      };
    }

    // 成功
    return {
      result: {
        engagement: v.data.engagement,
        strengths: v.data.strengths,
        weaknesses: v.data.weaknesses,
        recommendation: v.data.recommendation,
        follow_up_suggestion: v.data.follow_up_suggestion,
      },
      degraded: false,
    };
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { result: degradedResult('LLM 请求超时'), degraded: true, reason: 'TIMEOUT' };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { result: degradedResult(`LLM 调用异常：${msg}`), degraded: true, reason: 'NETWORK' };
  } finally {
    clearTimeout(timeout);
  }
}
