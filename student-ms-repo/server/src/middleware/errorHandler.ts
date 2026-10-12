import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { RuleError } from '../lib/rules.js';

// 统一错误处理：所有异常返回 JSON，不崩溃进程
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof RuleError) {
    res.status(err.status).json({
      error: err.message,
      rule: err.rule,
    });
    return;
  }
  // zod 校验错误 → 400 + 清晰字段级错误信息
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => {
      const path = i.path.length > 0 ? i.path.join('.') : '(body)';
      return { path, message: i.message };
    });
    const firstMsg = issues[0]?.message ?? '请求参数校验失败';
    res.status(400).json({
      error: firstMsg,
      code: 'VALIDATION',
      issues,
    });
    return;
  }
  if (err instanceof SyntaxError && err.message.includes('JSON')) {
    res.status(400).json({ error: '请求体不是有效 JSON', code: 'BAD_JSON' });
    return;
  }
  // SQLite 错误（CHECK 约束等）
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'SQLITE_CONSTRAINT_CHECK') {
      // 命中 R4 课时余额 CHECK 或电话格式 CHECK
      res.status(409).json({
        error: e.message ?? '数据库约束失败',
        rule: 'R4',
      });
      return;
    }
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({
        error: e.message ?? '唯一约束失败',
        rule: 'R1',
      });
      return;
    }
  }
  // 兜底
  // eslint-disable-next-line no-console
  console.error('[unhandled]', err);
  res.status(500).json({ error: '服务异常', code: 'INTERNAL' });
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not Found', code: 'NOT_FOUND' });
}
