// 漏斗详情页：点击工作台 5 个卡片进入，按 status 列出我负责的学生
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api, apiError } from '../api/client';
import { Spinner, Empty, StatusBadge, Card, Button, PageHeader } from '../components/ui';
import type { Student, StudentStatus } from '@sms/shared';

const STATUS_LABEL: Record<string, string> = {
  consulting: '咨询中',
  trial_scheduled: '已排试听',
  trial_done: '试听完成',
  enrolled: '已报名',
  churned: '已流失',
};

const STATUS_HINT: Record<string, string> = {
  consulting: '尚未安排试听，建议尽快联系安排试听',
  trial_scheduled: '已排试听，未上课；点击学生可查看时间线',
  trial_done: '试听完成待决定；尽快跟进反馈并促成报名',
  enrolled: '已报名在读学生；注意课时余额',
  churned: '已流失学生；可重新激活跟进',
};

export function FunnelDetail() {
  const { status = '' } = useParams<{ status: string }>();
  const nav = useNavigate();
  const [items, setItems] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const r = await api.get<{ items: Student[] }>('/students', {
          params: { status, owner: 'me' },
        });
        setItems(r.data.items);
        setErr(null);
      } catch (e) {
        setErr(apiError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [status]);

  const label = STATUS_LABEL[status] ?? status;
  const hint = STATUS_HINT[status];

  return (
    <div className="p-8">
      <PageHeader
        title={`${label} · ${loading ? '…' : `${items.length} 人`}`}
        desc={hint}
        action={
          <Link to="/dashboard">
            <Button variant="secondary"><ArrowLeft className="w-4 h-4" /> 返回工作台</Button>
          </Link>
        }
      />

      {loading ? (
        <Spinner />
      ) : err ? (
        <div className="p-6 text-bad text-sm">{err}</div>
      ) : items.length === 0 ? (
        <Empty title={`暂无「${label}」学生`} hint="可在「登记咨询」新增学生" />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-ink-soft">
              <tr>
                <th className="text-left px-4 py-3 font-medium">学生</th>
                <th className="text-left px-4 py-3 font-medium">年级</th>
                <th className="text-left px-4 py-3 font-medium">家长</th>
                <th className="text-left px-4 py-3 font-medium">电话</th>
                <th className="text-left px-4 py-3 font-medium">负责顾问</th>
                <th className="text-left px-4 py-3 font-medium">状态</th>
                <th className="text-left px-4 py-3 font-medium">登记时间</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => nav(`/students/${s.id}`)}
                  className="border-t border-gray-100 hover:bg-brand-soft/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-ink font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-ink-soft">{s.grade ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-soft">{s.parent_name ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-soft">{s.parent_phone ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-soft">{s.owner_admin_name ?? '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={s.status as StudentStatus} /></td>
                  <td className="px-4 py-3 text-ink-soft whitespace-nowrap">
                    {new Date(s.created_at).toLocaleString('zh-CN', { hour12: false })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
