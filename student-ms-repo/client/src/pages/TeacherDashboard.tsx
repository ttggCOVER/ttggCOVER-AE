// 老师工作台 — 今日课程 + 待反馈试听
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, ClipboardList, CheckCircle2, Clock, Users, ChevronRight } from 'lucide-react';
import { api, apiError } from '../api/client';
import { Spinner, ErrorState, Empty, Card, PageHeader, StatusBadge } from '../components/ui';
import type { TrialBooking } from '@sms/shared';

interface TrialWithStudent extends TrialBooking {
  student_name?: string;
  teacher_name?: string;
  feedback_text?: string | null;
}

interface ClassToday {
  id: number;
  name: string;
  subject: string;
  start_time: string;
  end_time: string;
  capacity: number;
  member_count: number;
  session_today: number;
}

export function TeacherDashboard() {
  const [trials, setTrials] = useState<TrialWithStudent[]>([]);
  const [classes, setClasses] = useState<ClassToday[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [tr, cr] = await Promise.all([
          api.get<{ items: TrialWithStudent[] }>('/trials?teacher=me'),
          api.get<{ items: ClassToday[] }>('/classes/today'),
        ]);
        setTrials(tr.data.items);
        setClasses(cr.data.items);
      } catch (e) {
        setErr(apiError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Spinner />;
  if (err) return <div className="p-8"><ErrorState message={err} /></div>;

  // 今日课表：scheduled_at 是今天 + status != cancelled
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const todayTrials = trials.filter((t) => {
    if (t.status === 'cancelled') return false;
    const d = new Date(t.scheduled_at);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return ds === todayStr;
  });

  // 待反馈：status=completed 但 feedback_text 为空
  const pendingFeedback = trials.filter((t) => t.status === 'completed' && !t.feedback_text);

  // 已反馈：status=completed 且 feedback_text 非空
  const doneFeedback = trials.filter((t) => t.status === 'completed' && t.feedback_text);

  // 即将到来：status=scheduled 且 scheduled_at 在未来
  const upcoming = trials.filter((t) => t.status === 'scheduled' && new Date(t.scheduled_at) > new Date());

  function fmtTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader title="今日课表" subtitle="老师工作台 · 查看今日试听与反馈任务" />

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <Users className="w-4 h-4" />
            <span className="text-xs">今日课程</span>
          </div>
          <div className="text-2xl font-bold text-ink">{classes.length}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <ClipboardList className="w-4 h-4" />
            <span className="text-xs">待反馈试听</span>
          </div>
          <div className="text-2xl font-bold text-ink">{pendingFeedback.length}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-green-600 mb-1">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-xs">已反馈</span>
          </div>
          <div className="text-2xl font-bold text-ink">{doneFeedback.length}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-purple-600 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs">即将到来</span>
          </div>
          <div className="text-2xl font-bold text-ink">{upcoming.length}</div>
        </Card>
      </div>

      {/* 今日课程（班级） */}
      <Card className="p-5 mb-6">
        <h2 className="font-medium text-ink mb-3">今日课程</h2>
        {classes.length === 0 ? (
          <Empty title="今日无班级课程" hint="有排课会在这里显示" />
        ) : (
          <div className="space-y-2">
            {classes.map((c) => (
              <Link
                key={c.id}
                to={`/classes/${c.id}/attendance`}
                className="flex items-center justify-between p-3 rounded border border-gray-200 hover:border-brand hover:bg-brand-soft/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="text-sm font-medium text-ink">{c.start_time}-{c.end_time}</div>
                  <div className="text-sm text-ink">{c.name}</div>
                  <span className="text-xs text-ink-soft">{c.subject}</span>
                  {c.session_today > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">已考勤</span>}
                </div>
                <div className="flex items-center gap-2 text-sm text-ink-soft">
                  <span>{c.member_count}/{c.capacity} 人</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* 今日试听 */}
      <Card className="p-5 mb-6">
        <h2 className="font-medium text-ink mb-3">今日试听</h2>
        {todayTrials.length === 0 ? (
          <Empty title="今日无试听安排" hint="有试听会在这里显示" />
        ) : (
          <div className="space-y-2">
            {todayTrials.map((t) => (
              <Link
                key={t.id}
                to={`/trials/${t.id}/feedback`}
                className="flex items-center justify-between p-3 rounded border border-gray-200 hover:border-brand hover:bg-brand-soft/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="text-sm font-medium text-ink">{fmtTime(t.scheduled_at)}</div>
                  <StatusBadge status={t.status} />
                </div>
                <div className="text-sm text-ink-soft">
                  {t.student_name ?? '未知学生'} · {t.duration_min} 分钟
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* 待反馈 */}
      <Card className="p-5 mb-6">
        <h2 className="font-medium text-ink mb-3">待反馈试听</h2>
        {pendingFeedback.length === 0 ? (
          <Empty title="无待反馈" hint="已完成的试听反馈会在这里显示" />
        ) : (
          <div className="space-y-2">
            {pendingFeedback.map((t) => (
              <Link
                key={t.id}
                to={`/trials/${t.id}/feedback`}
                className="flex items-center justify-between p-3 rounded border border-amber-200 bg-amber-50/50 hover:bg-amber-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <ClipboardList className="w-4 h-4 text-amber-600" />
                  <div>
                    <div className="text-sm text-ink">{t.student_name ?? '未知学生'}</div>
                    <div className="text-[11px] text-ink-soft">{fmtTime(t.scheduled_at)}</div>
                  </div>
                </div>
                <div className="text-xs text-amber-700">→ 提交反馈</div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* 已反馈 */}
      {doneFeedback.length > 0 && (
        <Card className="p-5">
          <h2 className="font-medium text-ink mb-3">已反馈</h2>
          <div className="space-y-2">
            {doneFeedback.map((t) => (
              <Link
                key={t.id}
                to={`/trials/${t.id}/feedback`}
                className="flex items-center justify-between p-3 rounded border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <div>
                    <div className="text-sm text-ink">{t.student_name ?? '未知学生'}</div>
                    <div className="text-[11px] text-ink-soft">{fmtTime(t.scheduled_at)}</div>
                  </div>
                </div>
                <div className="text-xs text-green-700">已反馈</div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
