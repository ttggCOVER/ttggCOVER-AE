// Admin 工作台：5 漏斗卡片 + 课时预警 + 待跟进列表
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, CalendarClock, CheckCircle2, BookOpen, AlertTriangle, ListTodo, Plus } from 'lucide-react';
import { api, apiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Spinner, Empty, StatusBadge, Card, Button, PageHeader } from '../components/ui';
import type { FunnelStats, Student, FollowUp } from '@sms/shared';

const FUNNEL_ITEMS = [
  { key: 'consulting', label: '咨询中', icon: Users, color: 'text-gray-600', bg: 'bg-gray-50' },
  { key: 'trial_scheduled', label: '已排试听', icon: CalendarClock, color: 'text-blue-700', bg: 'bg-blue-50' },
  { key: 'trial_done', label: '试听完成', icon: CheckCircle2, color: 'text-amber-700', bg: 'bg-amber-50' },
  { key: 'enrolled', label: '已报名', icon: BookOpen, color: 'text-emerald-700', bg: 'bg-emerald-50' },
  { key: 'churned', label: '已流失', icon: AlertTriangle, color: 'text-rose-700', bg: 'bg-rose-50' },
] as const;

export function AdminDashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [stats, setStats] = useState<FunnelStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lowCredit, setLowCredit] = useState<Student[]>([]);
  const [overdueFus, setOverdueFus] = useState<FollowUp[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [s, lc, fu] = await Promise.all([
          api.get<FunnelStats>('/students/funnel'),
          api.get<{ items: Student[] }>('/students/low-credit'),
          api.get<{ items: FollowUp[] }>('/follow-ups', { params: { status: 'pending', owner: 'me' } }),
        ]);
        setStats(s.data);
        setLowCredit(lc.data.items);
        // 过滤 overdue（due_at < now）
        const now = Date.now();
        setOverdueFus(fu.data.items.filter((f) => new Date(f.due_at).getTime() < now).slice(0, 10));
      } catch (e) {
        setErr(apiError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Spinner />;
  if (err) return <div className="p-8 text-bad">{err}</div>;
  if (!stats) return <Empty title="无法加载统计" />;

  return (
    <div className="p-8">
      <PageHeader
        title={`你好，${user?.name}`}
        desc="下面是你管的学生的整体情况。最常做的事都在左侧入口里。"
        action={<Link to="/consultations/new"><Button><Plus className="w-4 h-4" /> 登记咨询</Button></Link>}
      />

      {/* 漏斗卡片 */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {FUNNEL_ITEMS.map((it) => {
          const cnt = stats[it.key as keyof FunnelStats] as number;
          return (
            <button
              key={it.key}
              onClick={() => nav(`/funnel/${it.key}`)}
              className={`text-left p-4 rounded-lg border border-gray-200 hover:border-brand hover:shadow-sm transition-all ${it.bg}`}
              title={`查看「${it.label}」学生列表`}
            >
              <div className="flex items-center justify-between mb-2">
                <it.icon className={`w-5 h-5 ${it.color}`} />
                <span className="text-2xl font-semibold text-ink">{cnt}</span>
              </div>
              <div className="text-xs text-ink-soft">{it.label} · 点击查看 →</div>
            </button>
          );
        })}
      </div>

      {/* 警告条 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="font-medium text-ink">课时预警</span>
              <span className="text-xs text-ink-soft">余额 &lt; 120 分钟的已报名学生</span>
            </div>
            <Link to="/follow-ups" className="text-xs text-brand hover:underline">去跟进 →</Link>
          </div>
          {lowCredit.length === 0 ? (
            <Empty title="暂无预警" />
          ) : (
            <ul className="space-y-1.5">
              {lowCredit.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center justify-between text-sm">
                  <button onClick={() => nav(`/students/${s.id}`)} className="text-ink hover:text-brand">
                    {s.name} · {s.grade}
                  </button>
                  <span className="text-amber-700 font-medium">{(s as any).balance ?? '?'} 分钟</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-bad" />
              <span className="font-medium text-ink">已过期未跟进</span>
              <span className="text-xs text-ink-soft">{stats.overdue_followups} 条总计</span>
            </div>
            <Link to="/follow-ups" className="text-xs text-brand hover:underline">查看全部 →</Link>
          </div>
          {overdueFus.length === 0 ? (
            <Empty title="暂无过期跟进" />
          ) : (
            <ul className="space-y-1.5">
              {overdueFus.slice(0, 5).map((f) => (
                <li key={f.id} className="flex items-center justify-between text-sm">
                  <button onClick={() => nav(`/students/${f.student_id}`)} className="text-ink hover:text-brand truncate">
                    {f.student_name ?? `#${f.student_id}`}：{f.content.slice(0, 20)}…
                  </button>
                  <span className="text-xs text-bad ml-2">
                    {new Date(f.due_at).toLocaleDateString('zh-CN')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* 待跟进完整列表（只看自己的） */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="font-medium text-ink">我负责的待跟进（最多 10 条）</div>
        </div>
        {overdueFus.length === 0 && (
          <p className="text-sm text-ink-soft">尚无待处理跟进。新咨询的学生会从这里走起 →</p>
        )}
      </Card>
    </div>
  );
}
