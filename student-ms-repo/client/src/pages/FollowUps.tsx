// 跟进工作台 — admin 看自己负责的待跟进，标记完成
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock } from 'lucide-react';
import { api, apiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Spinner, Empty, ErrorState, Card, PageHeader, Button } from '../components/ui';
import type { FollowUp } from '@sms/shared';

export function FollowUps() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'done' | 'overdue'>('pending');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const params: Record<string, string> = { owner: 'me' };
        if (filter === 'done') params.status = 'done';
        else if (filter === 'overdue') { params.status = 'pending'; params.overdue = '1'; }
        else params.status = 'pending';
        const r = await api.get<{ items: FollowUp[] }>('/follow-ups', { params });
        setItems(r.data.items);
      } catch (e) {
        setErr(apiError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [filter]);

  async function markDone(id: number) {
    try {
      await api.post(`/follow-ups/${id}/done`);
      setItems(items.filter((f) => f.id !== id));
    } catch (e) {
      setErr(apiError(e));
    }
  }

  const tabs: { key: typeof filter; label: string }[] = [
    { key: 'pending', label: '待跟进' },
    { key: 'overdue', label: '已过期' },
    { key: 'done',   label: '已完成' },
  ];

  return (
    <div className="p-8">
      <PageHeader title="跟进工作台" desc={`显示你（${user?.name}）负责的跟进任务。`} />
      <div className="flex gap-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`px-3 py-1 text-sm rounded border ${filter === t.key ? 'bg-brand text-white border-brand' : 'bg-white text-ink border-gray-300 hover:bg-gray-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        {loading ? (
          <Spinner />
        ) : err ? (
          <ErrorState message={err} />
        ) : items.length === 0 ? (
          <Empty title="暂无跟进" hint={filter === 'pending' ? '新咨询/试听完成后会自动出现' : undefined} />
        ) : (
          <ul className="divide-y divide-gray-200">
            {items.map((f) => {
              const overdue = !f.done_at && new Date(f.due_at).getTime() < Date.now();
              return (
                <li key={f.id} className="flex items-start gap-3 p-4 hover:bg-gray-50">
                  <div className={`w-2 h-2 mt-1.5 rounded-full ${overdue ? 'bg-bad' : 'bg-amber-400'}`} />
                  <div className="flex-1">
                    <button onClick={() => nav(`/students/${f.student_id}`)} className="font-medium text-ink hover:text-brand">
                      {f.student_name ?? `#${f.student_id}`}
                    </button>
                    <span className="ml-2 text-xs text-ink-soft">
                      {f.type === 'after_trial' ? '试听后' : f.type === 'renewal' ? '续费' : '流失'}
                    </span>
                    <div className="text-sm text-ink mt-0.5">{f.content}</div>
                    {f.next_action && <div className="text-xs text-ink-soft mt-1">下一步：{f.next_action}</div>}
                    <div className={`text-xs mt-1 flex items-center gap-1 ${overdue ? 'text-bad' : 'text-ink-soft'}`}>
                      <Clock className="w-3 h-3" />
                      到期：{new Date(f.due_at).toLocaleString('zh-CN')}
                      {f.done_at && ` · 完成：${new Date(f.done_at).toLocaleString('zh-CN')}`}
                    </div>
                  </div>
                  {!f.done_at && (
                    <Button variant="ghost" onClick={() => markDone(f.id)}>
                      <CheckCircle2 className="w-4 h-4" /> 完成
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
