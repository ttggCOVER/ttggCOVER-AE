// 前后端共享的类型定义
// 所有 DB 实体 + 请求/响应 DTO 在这里定义，避免前后端不一致

// ---------- 基础枚举 ----------

export type UserRole = 'admin' | 'teacher';

export type StudentStatus =
  | 'consulting'        // 咨询中（未安排试听）
  | 'trial_scheduled'   // 已安排试听，未上课
  | 'trial_done'        // 试听完成，待决定
  | 'enrolled'          // 已报名，正常上课
  | 'churned';          // 流失

export type TrialStatus = 'pending' | 'completed' | 'cancelled';

export type ConsultationChannel = 'wechat' | 'call' | 'walkin';

export type FollowUpType = 'after_trial' | 'renewal' | 'churn';

export type Recommendation = 'enroll' | 'not_now' | 'reject' | 'pending';

export type Engagement = 'high' | 'medium' | 'low';

// ---------- DB 实体 ----------

export interface User {
  id: number;
  name: string;
  role: UserRole;
  email: string;
  phone?: string | null;
  dept: string | null;
  created_at: string;
}

export interface Student {
  id: number;
  name: string;
  parent_name: string;
  parent_phone: string | null;
  grade: string | null;
  status: StudentStatus;
  owner_admin_id: number;
  owner_admin_name?: string; // JOIN 字段
  notes: string | null;
  created_at: string;
}

export interface Consultation {
  id: number;
  student_id: number;
  channel: ConsultationChannel;
  source: string | null;
  need: string | null;
  created_at: string;
  created_by: number;
  created_by_name?: string;
}

export interface TrialBooking {
  id: number;
  student_id: number;
  student_name?: string;
  teacher_id: number;
  teacher_name?: string;
  scheduled_at: string;        // ISO，Melbourne 时区
  duration_min: number;
  status: TrialStatus;
  feedback_text: string | null;
  extracted_feedback: ExtractedFeedback | null;
  recommendation: Recommendation | null;
  created_at: string;
  created_by: number;
  created_by_name?: string;
}

// LLM 抽取结果（zod schema 校验后存这里）
export interface ExtractedFeedback {
  engagement: Engagement;
  strengths: string[];
  weaknesses: string[];
  recommendation: Recommendation;
  follow_up_suggestion: string;
  _degraded?: boolean; // 降级标记
}

export interface ClassEntity {
  id: number;
  name: string;
  teacher_id: number;
  teacher_name?: string;
  weekday: number; // 0=周日 ... 1=周一
  start_time: string; // "HH:MM"
  end_time: string;
  subject: string;
  capacity: number;
}

export interface ClassMember {
  student_id: number;
  class_id: number;
  enrolled_at: string;
  student_name?: string;
}

export interface LessonCredit {
  student_id: number;
  balance: number; // 分钟
  updated_at: string;
}

export interface LessonTransaction {
  id: number;
  student_id: number;
  delta_min: number;  // 正数=购入，负数=消耗
  reason: 'purchase' | 'consume' | 'refund';
  ref_class_session_id: number | null;
  note: string | null;
  created_at: string;
}

export interface FollowUp {
  id: number;
  student_id: number;
  student_name?: string;
  type: FollowUpType;
  content: string;
  next_action: string | null;
  due_at: string;
  done_at: string | null;
  owner_admin_id: number;
  owner_admin_name?: string;
  trial_booking_id: number | null;
  created_at: string;
}

// ---------- API DTO ----------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: Omit<User, 'created_at'> & { created_at: string };
}

export interface FunnelStats {
  consulting: number;
  trial_scheduled: number;
  trial_done: number;
  enrolled: number;
  churned: number;
  low_credit: number; // 余额 < 60min 的 enrolled 学生数
  overdue_followups: number;
}

export interface CreateConsultationRequest {
  student_name: string;
  parent_name: string;
  parent_phone?: string;
  grade?: string;
  notes?: string;
  channel: ConsultationChannel;
  source?: string;
  need?: string;
  // 在登记咨询的同时，可以直接指定 owner_admin_id（默认为当前 admin）
}

export interface ScheduleTrialRequest {
  student_id: number;
  teacher_id: number;
  scheduled_at: string; // ISO
  duration_min: number;
}

export interface ConflictPreview {
  has_conflict: boolean;
  conflicts: Array<{
    type: 'trial' | 'class';
    description: string;
  }>;
}

export interface SubmitTrialFeedbackRequest {
  feedback_text: string;
}

export interface ExtractFeedbackResponse {
  extracted: ExtractedFeedback;
  persisted: boolean;
}

// ---------- 错误响应 ----------

export interface ApiError {
  error: string;
  code?: string;
  detail?: unknown;
  rule?: string; // 触发的业务规则编号，便于展示
}
