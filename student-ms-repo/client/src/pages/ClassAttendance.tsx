// 班级考勤页 — 老师查看名单、记出勤、扣课时
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, X, Clock, ArrowLeft, Users, Coins } from 'lucide-react';
import { api, apiError } from '../api/client';
import { Spinner, ErrorState, Empty, Card, PageHeader, Button, StatusBadge } from '../components/ui';

interface ClassInfo {
  id: number;
  name: string;
  subject: string;
  weekday: number;
  start_time: string;
  end_time: string;
  capacity: number;
  teacher_name: string;
}

interface Member {
  id: number;
  name: string;
  grade: string | null;
  parent_name: string;
  parent_phone: string | null;
  status: string;
  lesson_balance: number | null;
}

type AttStatus = 'present' | 'absent' | 'late';

export function ClassAttendance() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [cls, setCls] = useState<ClassInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [attendance, setAttendance] = useState<Record<number, AttStatus>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<{ total_deducted: number; present_count: number; results: any[] } | null>(null);
  const [deductMin, setDeductMin] = useState(45); // 默认一节课 45 分钟，老师可自行调整

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<{ class: ClassInfo; members: Member[] }>(`/classes/${id}/roster`);
        setCls(r.data.class);
        setMembers(r.data.members);
        // 默认全部出席
        const init: Record<number, AttStatus> = {};
        r.data.members.forEach((m) => { init[m.id] = 'present'; });
        setAttendance(init);
      } catch (e) {
        setErr(apiError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <Spinner />;
  if (err) return <div className="p-8"><ErrorState message={err} /></div>;
  if (!cls) return <Empty title="班级不存在" />;

  const durationMin = (() => {
    const [sh, sm] = cls.start_time.split(':').map(Number);
    const [eh, em] = cls.end_time.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  })();

  const today = new Date().toLocaleString('en-US', { timeZone: 'Australia/Melbourne' });
  const d = new Date(today);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const presentCount = Object.values(attendance).filter((s) => s === 'present' || s === 'late').length;
  const absentCount = Object.values(attendance).filter((s) => s === 'absent').length;
  const totalDeduct = members
    .filter((m) => attendance[m.id] === 'present' || attendance[m.id] === 'late')
    .reduce((sum, m) => sum + deductMin, 0);

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const students = members.map((m) => ({
        student_id: m.id,
        status: attendance[m.id],
        minutes: deductMin,
      }));
      const r = await api.post(`/classes/${id}/take-attendance`, {
        session_date: dateStr,
        students,
      });
      setResult(r.data);
      setDone(true);
    } catch (e) {
      setErr(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  const statusBtn = (sid: number, s: AttStatus) => {
    const cur = attendance[sid];
    const active = cur === s;
    const base = 'px-2 py-0.5 rounded text-xs border transition-colors';
    const map: Record<AttStatus, string> = {
      present: active ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50',
      late: active ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50',
      absent: active ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50',
    };
    return (
      <button key={s} onClick={() => setAttendance({ ...attendance, [sid]: s })} className={`${base} ${map[s]}`}>
        {s === 'present' ? '出席' : s === 'late' ? '迟到' : '缺席'}
      </button>
    );
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button onClick={() => nav('/dashboard')} className="flex items-center gap-1 text-sm text-ink-soft hover:text-ink mb-3">
        <ArrowLeft className="w-4 h-4" /> 返回工作台
      </button>
      <PageHeader title={cls.name} subtitle={`${cls.subject} · ${cls.start_time}-${cls.end_time} · ${durationMin} 分钟 · 老师：${cls.teacher_name}`} />

      {done && result ? (
        <Card className="p-6 text-center">
          <Check className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <div className="text-lg font-medium text-ink mb-2">考勤完成</div>
          <div className="text-sm text-ink-soft mb-4">
            出席 {result.present_count} 人 · 共扣课时 {result.total_deducted} 分钟
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto text-left mb-4">
            {result.results.map((r: any) => {
              const m = members.find((x) => x.id === r.student_id);
              return (
                <div key={r.student_id} className="flex justify-between text-xs bg-gray-50 rounded px-2 py-1">
                  <span>{m?.name ?? r.student_id}</span>
                  <span className="text-ink-soft">
                    {r.status === 'present' ? '出席' : r.status === 'late' ? '迟到' : '缺席'}
                    {r.deducted > 0 ? ` · -${r.deducted} 分钟` : ''} · 余额 {r.balance_after}
                  </span>
                </div>
              );
            })}
          </div>
          <Button onClick={() => nav('/dashboard')}>返回工作台</Button>
        </Card>
      ) : (
        <Card className="p-5">
          {/* 扣课时设置 */}
          <div className="flex items-center gap-3 mb-4 p-3 bg-amber-50 rounded border border-amber-200">
            <Coins className="w-4 h-4 text-amber-600" />
            <span className="text-sm text-ink">本次每人扣课时</span>
            <input
              type="number"
              min={1}
              max={480}
              value={deductMin}
              onChange={(e) => setDeductMin(Math.max(1, Math.min(480, Number(e.target.value) || 0)))}
              className="input w-20 text-center"
            />
            <span className="text-sm text-ink-soft">分钟</span>
            <div className="flex gap-1 ml-2">
              {[30, 45, 60, 90, 120].map((m) => (
                <button
                  key={m}
                  onClick={() => setDeductMin(m)}
                  className={`text-[10px] px-2 py-0.5 rounded border ${deductMin === m ? 'bg-amber-200 border-amber-400 text-amber-900' : 'bg-white border-gray-200 text-ink-soft hover:bg-amber-50'}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <span className="text-xs text-ink-soft ml-auto">课程时长 {durationMin} 分钟（可自行调整扣课时）</span>
          </div>

          {/* 统计条 */}
          <div className="flex items-center gap-4 mb-4 text-sm">
            <div className="flex items-center gap-1"><Users className="w-4 h-4 text-ink-soft" /> 共 {members.length} 人</div>
            <div className="flex items-center gap-1 text-emerald-700"><Check className="w-4 h-4" /> 出席+迟到 {presentCount}</div>
            <div className="flex items-center gap-1 text-rose-700"><X className="w-4 h-4" /> 缺席 {absentCount}</div>
            <div className="flex items-center gap-1 text-amber-700"><Coins className="w-4 h-4" /> 将扣 {totalDeduct} 分钟</div>
          </div>

          {members.length === 0 ? (
            <Empty title="班级暂无学生" hint="报名后学生会自动加入班级" />
          ) : (
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-3 rounded border border-gray-200 hover:bg-gray-50">
                  <div className="flex-1">
                    <div className="text-sm text-ink font-medium">{m.name}</div>
                    <div className="text-xs text-ink-soft">
                      {m.grade ?? '—'} · {m.parent_name} · {m.parent_phone ?? '无电话'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-xs text-ink-soft">课时余额</div>
                      <div className={`text-sm font-medium ${(m.lesson_balance ?? 0) < 120 ? 'text-bad' : 'text-ink'}`}>
                        {m.lesson_balance ?? 0} 分钟
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {(['present', 'late', 'absent'] as AttStatus[]).map((s) => statusBtn(m.id, s))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {err && <div className="mt-3 text-sm text-bad p-2 bg-bad-soft rounded">{err}</div>}

          <div className="mt-4 flex gap-2">
            <Button onClick={submit} loading={submitting} disabled={members.length === 0}>
              <Check className="w-4 h-4" /> 确认考勤并扣课时
            </Button>
            <Button variant="secondary" onClick={() => nav('/dashboard')}>取消</Button>
          </div>
          <div className="text-xs text-ink-soft mt-2">
            出席/迟到各扣 {deductMin} 分钟，缺席不扣课时。
          </div>
        </Card>
      )}
    </div>
  );
}
