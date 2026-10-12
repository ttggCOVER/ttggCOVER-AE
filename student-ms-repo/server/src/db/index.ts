// node:sqlite 单例 + schema 初始化
// 用 Node 22 内置的 node:sqlite 模块（--experimental-sqlite flag）
// 无需 native 编译，跨平台
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../data/student-ms.db');

// 确保目录存在
mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

export function initSchema(): void {
  const schema = readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
}

// 自动初始化（首次 import 时）
initSchema();

// ---------- 类型安全的查询辅助 ----------
// 业务代码请直接用 db.prepare() 写 SQL，避免黑魔法 ORM
export function row<T = any>(sql: string, ...params: any[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}
export function rows<T = any>(sql: string, ...params: any[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}
export function run(sql: string, ...params: any[]): { changes: number; lastInsertRowid: number | bigint } {
  return db.prepare(sql).run(...params) as { changes: number; lastInsertRowid: number | bigint };
}

// 事务包装（node:sqlite 没有 .transaction()，需要手动 BEGIN/COMMIT/ROLLBACK）
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
