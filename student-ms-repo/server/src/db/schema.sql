-- ============================================================
-- 学生管理系统 Schema
-- SQLite via better-sqlite3
-- 时区：业务时间统一按 Australia/Melbourne 处理（应用层 luxon）
-- ============================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ---------- 用户表（admin / teacher 共用） ----------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','teacher')),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone         TEXT CHECK (phone IS NULL OR phone GLOB '1[3-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  dept          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- 学生 ----------
CREATE TABLE IF NOT EXISTS students (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  parent_name    TEXT NOT NULL,
  parent_phone   TEXT CHECK (parent_phone IS NULL OR parent_phone GLOB '1[3-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  grade          TEXT,
  status         TEXT NOT NULL DEFAULT 'consulting'
                 CHECK (status IN ('consulting','trial_scheduled','trial_done','enrolled','churned')),
  owner_admin_id INTEGER NOT NULL,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_admin_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_students_status      ON students(status);
CREATE INDEX IF NOT EXISTS idx_students_owner       ON students(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_students_status_owner ON students(status, owner_admin_id);

-- ---------- 咨询记录（学生可能多次咨询） ----------
CREATE TABLE IF NOT EXISTS consultations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL,
  channel     TEXT NOT NULL CHECK (channel IN ('wechat','call','walkin')),
  source      TEXT,
  need        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  created_by  INTEGER NOT NULL,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_consultations_student ON consultations(student_id);

-- ---------- 试听预约 ----------
CREATE TABLE IF NOT EXISTS trial_bookings (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id         INTEGER NOT NULL,
  teacher_id         INTEGER NOT NULL,
  scheduled_at       TEXT NOT NULL,                -- ISO 8601 UTC 字符串
  duration_min       INTEGER NOT NULL DEFAULT 60 CHECK (duration_min > 0 AND duration_min <= 240),
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','completed','cancelled')),
  feedback_text      TEXT,
  extracted_feedback TEXT,                          -- JSON 字符串
  recommendation     TEXT CHECK (recommendation IN ('enroll','not_now','reject','pending') OR recommendation IS NULL),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  created_by         INTEGER NOT NULL,
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (created_by)  REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_trial_student ON trial_bookings(student_id);
CREATE INDEX IF NOT EXISTS idx_trial_teacher ON trial_bookings(teacher_id);
CREATE INDEX IF NOT EXISTS idx_trial_status  ON trial_bookings(status);
CREATE INDEX IF NOT EXISTS idx_trial_sched   ON trial_bookings(scheduled_at);

-- R1：同一学生只能有一条 status='completed' 的试听（partial unique index）
-- SQLite 3.8+ 支持部分索引
CREATE UNIQUE INDEX IF NOT EXISTS uniq_trial_completed_per_student
  ON trial_bookings(student_id)
  WHERE status = 'completed';

-- ---------- 班级（每周固定模板） ----------
CREATE TABLE IF NOT EXISTS classes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  teacher_id INTEGER NOT NULL,
  weekday    INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,   -- "HH:MM"
  end_time   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  capacity   INTEGER NOT NULL DEFAULT 6 CHECK (capacity BETWEEN 1 AND 30),
  FOREIGN KEY (teacher_id) REFERENCES users(id)
);

-- ---------- 班级成员（多对多） ----------
CREATE TABLE IF NOT EXISTS class_members (
  student_id INTEGER NOT NULL,
  class_id   INTEGER NOT NULL,
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (student_id, class_id),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id)   REFERENCES classes(id) ON DELETE CASCADE
);

-- ---------- 班级上课记录（每次实际开课一条） ----------
CREATE TABLE IF NOT EXISTS class_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id    INTEGER NOT NULL,
  session_date TEXT NOT NULL,   -- YYYY-MM-DD
  status      TEXT NOT NULL DEFAULT 'scheduled'
              CHECK (status IN ('scheduled','completed','cancelled')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cs_class_date ON class_sessions(class_id, session_date);

-- ---------- 出勤记录（每学生每节课一条） ----------
CREATE TABLE IF NOT EXISTS attendance (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      INTEGER NOT NULL,
  student_id      INTEGER NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('present','absent','late')),
  minutes_deducted INTEGER NOT NULL DEFAULT 0,  -- 本次扣除分钟数
  note            TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES class_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  UNIQUE (session_id, student_id)
);

-- ---------- 课时账本（每学生一条余额 + 流水） ----------
CREATE TABLE IF NOT EXISTS lesson_credits (
  student_id INTEGER PRIMARY KEY,
  balance    INTEGER NOT NULL DEFAULT 0,    -- 单位：分钟。CHECK 兜底防透支
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CHECK (balance >= 0)
);

CREATE TABLE IF NOT EXISTS lesson_transactions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id         INTEGER NOT NULL,
  delta_min          INTEGER NOT NULL,    -- 正数=购入，负数=消耗
  reason             TEXT NOT NULL CHECK (reason IN ('purchase','consume','refund')),
  ref_class_session_id INTEGER,
  note               TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lt_student ON lesson_transactions(student_id);

-- ---------- 跟进记录 ----------
CREATE TABLE IF NOT EXISTS follow_ups (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id        INTEGER NOT NULL,
  type              TEXT NOT NULL CHECK (type IN ('after_trial','renewal','churn')),
  content           TEXT NOT NULL,
  next_action       TEXT,
  due_at            TEXT NOT NULL,
  done_at           TEXT,
  owner_admin_id    INTEGER NOT NULL,
  trial_booking_id  INTEGER,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (student_id)       REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_admin_id)   REFERENCES users(id),
  FOREIGN KEY (trial_booking_id) REFERENCES trial_bookings(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_fu_owner_done ON follow_ups(owner_admin_id, done_at);
CREATE INDEX IF NOT EXISTS idx_fu_due       ON follow_ups(due_at);
