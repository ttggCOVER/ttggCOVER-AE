// 通用组件：Spinner / Empty / StatusBadge / Button / Card
import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import type { StudentStatus, Recommendation, Engagement } from '@sms/shared';

export function Spinner({ label = '加载中…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 text-ink-soft py-8">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Empty({ title = '暂无数据', hint }: { title?: string; hint?: string }) {
  return (
    <div className="text-center py-12 text-ink-soft">
      <div className="text-base">{title}</div>
      {hint && <div className="text-xs mt-1">{hint}</div>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-bad">
      <div className="text-base">加载失败</div>
      <div className="text-xs mt-1">{message}</div>
    </div>
  );
}

const STATUS_META: Record<StudentStatus, { label: string; cls: string }> = {
  consulting:      { label: '咨询中',   cls: 'bg-gray-100 text-ink' },
  trial_scheduled: { label: '已排试听', cls: 'bg-blue-50 text-blue-700' },
  trial_done:      { label: '试听完成', cls: 'bg-amber-50 text-amber-700' },
  enrolled:        { label: '已报名',   cls: 'bg-emerald-50 text-emerald-700' },
  churned:         { label: '已流失',   cls: 'bg-rose-50 text-rose-700' },
};

export function StatusBadge({ status }: { status: StudentStatus }) {
  const m = STATUS_META[status] ?? { label: status, cls: 'bg-gray-100 text-ink' };
  return <span className={`px-2 py-0.5 rounded text-xs ${m.cls}`}>{m.label}</span>;
}

const REC_META: Record<Recommendation, { label: string; cls: string }> = {
  enroll:   { label: '推荐报名', cls: 'bg-emerald-50 text-emerald-700' },
  not_now:  { label: '暂缓',     cls: 'bg-amber-50 text-amber-700' },
  reject:   { label: '不建议',   cls: 'bg-rose-50 text-rose-700' },
  pending:  { label: '待人工',   cls: 'bg-gray-100 text-ink' },
};

export function RecBadge({ rec }: { rec: Recommendation }) {
  const m = REC_META[rec] ?? { label: rec, cls: 'bg-gray-100 text-ink' };
  return <span className={`px-2 py-0.5 rounded text-xs ${m.cls}`}>{m.label}</span>;
}

const ENG_META: Record<Engagement, string> = {
  high: '高',
  medium: '中',
  low: '低',
};
export function EngagementTag({ e }: { e: Engagement }) {
  return <span className="text-xs text-ink-soft">参与度: {ENG_META[e]}</span>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>{children}</div>;
}

export function Button({
  children,
  variant = 'primary',
  loading,
  ...rest
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base = 'inline-flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary:   'bg-brand text-white hover:bg-brand-dark',
    secondary: 'bg-gray-100 text-ink hover:bg-gray-200',
    danger:    'bg-bad text-white hover:brightness-110',
    ghost:     'text-ink hover:bg-gray-100',
  };
  return (
    <button className={`${base} ${variants[variant]}`} disabled={loading || rest.disabled} {...rest}>
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}

export function PageHeader({ title, desc, action }: { title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {desc && <p className="text-sm text-ink-soft mt-0.5">{desc}</p>}
      </div>
      {action}
    </div>
  );
}
