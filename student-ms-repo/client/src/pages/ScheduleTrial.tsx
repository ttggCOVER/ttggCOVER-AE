// 安排试听 — 选学生/老师/时间，实时冲突检测
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Search, AlertTriangle, CheckCircle2, UserCheck } from 'lucide-react';
import { api, apiError } from '../api/client';
import { Button, PageHeader, Card, Spinner, Empty } from '../components/ui';
import type { Student, User, ConflictPreview } from '@sms/shared';

export function ScheduleTrial() {
  const nav = useNavigate();
  const [urlSearchParams] = useSearchParams();
  // 从 URL 读取预填学生 id（从学生详情页「安排试听」跳转时携带）
  const initialStudentId = urlSearchParams.get('student_id');

  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [keyword, setKeyword] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<number | null>(null);
  // 已选定的学生对象（无论来自 URL 锁定还是搜索点选），不为 null 时学生栏渲染为信息卡片
  const [lockedStudent, setLockedStudent] = useState<Student | null>(null);
  const [teacherId, setTeacherId] = useState<number | null>(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [duration, setDuration] = useState(60);
  const [conflict, setConflict] = useState<ConflictPreview | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const tasks: Promise<unknown>[] = [
          api.get<{ items: User[] }>('/users', { params: { role: 'teacher' } }).then((r) => setTeachers(r.data.items)),
        ];
        // 如果 URL 带 student_id，直接拉该学生详情并锁定
        if (initialStudentId) {
          const sid = Number(initialStudentId);
          tasks.push(
            api.get<{ student: Student }>(`/students/${sid}`).then((r) => {
              setLockedStudent(r.data.student);
              setSelectedStudent(r.data.student.id);
            }),
          );
        }
        await Promise.all(tasks);
      } catch (e) {
        setErr(apiError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [initialStudentId]);

  // 搜索学生（带 debounce）— 已锁定学生时不再发请求
  useEffect(() => {
    if (lockedStudent || !keyword.trim()) {
      setStudents([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await api.get<{ items: Student[] }>('/students', { params: { keyword } });
        setStudents(r.data.items);
      } catch (e) {
        setErr(apiError(e));
      }
    }, 300);
    return () => clearTimeout(t);
  }, [keyword, lockedStudent]);

  // 实时冲突检测
  useEffect(() => {
    if (!selectedStudent || !scheduledAt) {
      setConflict(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const iso = new Date(scheduledAt).toISOString();
        const r = await api.post<ConflictPreview>('/trials/preview-conflict', {
          student_id: selectedStudent,
          scheduled_at: iso,
          duration_min: duration,
        });
        setConflict(r.data);
      } catch (e) {
        // 忽略，等用户继续填
      }
    }, 400);
    return () => clearTimeout(t);
  }, [selectedStudent, scheduledAt, duration]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!selectedStudent || !teacherId || !scheduledAt) {
      setErr('请完整填写');
      return;
    }
    if (conflict?.has_conflict) {
      setErr('当前有冲突，无法安排');
      return;
    }
    setSubmitting(true);
    try {
      const iso = new Date(scheduledAt).toISOString();
      await api.post('/trials', {
        student_id: selectedStudent,
        teacher_id: teacherId,
        scheduled_at: iso,
        duration_min: duration,
      });
      nav('/dashboard');
    } catch (e) {
      setErr(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Spinner />;

  // 学生栏渲染：锁定学生时直接展示信息卡片；否则展示搜索框
  const renderStudentField = () => {
    if (lockedStudent) {
      // 从详情页跳转锁定，直接展示学生+家长信息
      return (
        <div className="p-3 rounded border border-emerald-200 bg-emerald-50/50">
          <div className="flex items-center gap-2 text-sm">
            <UserCheck className="w-4 h-4 text-emerald-600" />
            <span className="font-medium">{lockedStudent.name}</span>
            <span className="text-ink-soft">{lockedStudent.grade}</span>
            <span className="px-1.5 py-0.5 rounded text-[11px] bg-emerald-100 text-emerald-700">已选定</span>
          </div>
          <div className="mt-1.5 text-xs text-ink-soft grid grid-cols-2 gap-x-3 gap-y-0.5">
            <div>家长：{lockedStudent.parent_name}</div>
            <div>电话：<span className="font-mono">{lockedStudent.parent_phone ?? '—'}</span></div>
            <div className="col-span-2">归属：{lockedStudent.owner_admin_name ?? '—'}</div>
          </div>
          <Link to={`/students/${lockedStudent.id}`} className="text-[11px] text-brand hover:underline mt-1 inline-block">→ 查看学生详情</Link>
        </div>
      );
    }
    // 走搜索流程
    return (
      <>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
            <input
              className="input pl-8"
              placeholder="搜索学生姓名 / 家长 / 电话"
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                // 已锁定后又改输入框 → 说明想换学生，清空锁定状态触发重新搜索
                if (lockedStudent) {
                  setLockedStudent(null);
                  setSelectedStudent(null);
                }
              }}
            />
          </div>
        </div>
        {students.length > 0 && (
          <ul className="mt-2 border border-gray-200 rounded divide-y max-h-48 overflow-auto">
            {students.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStudent(s.id);
                        setLockedStudent(s);
                        setKeyword('');
                        setStudents([]);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${selectedStudent === s.id ? 'bg-brand-soft' : ''}`}
                    >
                      <span className="font-medium">{s.name}</span>
                      <span className="text-ink-soft ml-2">{s.grade}</span>
                      <span className="text-ink-soft ml-2">家长：{s.parent_name}</span>
                      <span className="text-ink-soft ml-2 font-mono">{s.parent_phone ?? '—'}</span>
                      {s.status === 'churned' && <span className="ml-2 text-xs text-bad">（已流失，不可排试听）</span>}
                    </button>
                  </li>
                ))}
          </ul>
        )}
        {keyword && students.length === 0 && !lockedStudent && (
          <div className="text-xs text-ink-soft mt-1"><Empty title="无匹配" /></div>
        )}
      </>
    );
  };

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader title="安排试听" desc="时间冲突、流失学生、重复试听都会在服务端校验；前端只是预览。" />

      <Card className="p-6">
        <form onSubmit={submit} className="space-y-5">
          {/* 学生栏（锁定或搜索） */}
          <div>
            <label className="block text-xs text-ink-soft mb-1">学生 *</label>
            {renderStudentField()}
          </div>

          {/* 老师 */}
          <div>
            <label className="block text-xs text-ink-soft mb-1">老师 *</label>
            <select className="input" value={teacherId ?? ''} onChange={(e) => setTeacherId(Number(e.target.value))} required>
              <option value="">— 选择老师 —</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.phone ? ` · ${t.phone}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 时间 + 时长 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-ink-soft mb-1">试听时间（Melbourne） *</label>
              <input
                type="datetime-local"
                className="input"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-ink-soft mb-1">时长（分钟）</label>
              <select className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                <option value={30}>30</option>
                <option value={45}>45</option>
                <option value={60}>60</option>
                <option value={90}>90</option>
              </select>
            </div>
          </div>

          {/* 冲突预览 */}
          {conflict && (
            <div className={`p-3 rounded border ${conflict.has_conflict ? 'bg-bad-soft border-bad/30' : 'bg-good-soft border-good/30'}`}>
              <div className="flex items-center gap-2 text-sm">
                {conflict.has_conflict ? (
                  <><AlertTriangle className="w-4 h-4 text-bad" /> <span className="text-bad font-medium">检测到冲突</span></>
                ) : (
                  <><CheckCircle2 className="w-4 h-4 text-good" /> <span className="text-good font-medium">无冲突</span></>
                )}
              </div>
              {conflict.has_conflict && (
                <ul className="mt-1 text-xs text-ink-soft space-y-0.5">
                  {conflict.conflicts.map((c, i) => (
                    <li key={i}>· [{c.type}] {c.description}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {err && <div className="text-sm text-bad p-2 bg-bad-soft rounded">{err}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => nav(-1)}>取消</Button>
            <Button type="submit" loading={submitting} disabled={!!conflict?.has_conflict}>安排试听</Button>
          </div>
        </form>
      </Card>

    </div>
  );
}
