// 学生详情 — 时间线（咨询 → 试听 → 跟进 → 课时）
import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Phone, GraduationCap, FileText, Calendar, Sparkles, MessageSquare, Coins, UserCheck, Trash2, Clock } from 'lucide-react';
import { api, apiError } from '../api/client';
import { Spinner, ErrorState, Empty, StatusBadge, Card, PageHeader, RecBadge, Button } from '../components/ui';
import type { Student, Consultation, TrialBooking, FollowUp } from '@sms/shared';

interface LessonTx {
  id: number;
  delta_min: number;
  reason: string;
  note: string | null;
  created_at: string;
}

interface Detail {
  student: Student;
  timeline: { consultations: Consultation[]; trials: TrialBooking[]; followUps: FollowUp[] };
  lesson: {
    balance: number;
    updated_at: string;
    total_purchased: number;
    total_consumed: number;
    consumption_rate: number;
    recent_transactions: LessonTx[];
  } | null;
}

export function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // 报名表单 state
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollMinutes, setEnrollMinutes] = useState(1200); // 默认 20 小时 = 1200 分钟
  const [enrolling, setEnrolling] = useState(false);
  const [enrollErr, setEnrollErr] = useState<string | null>(null);

  // 备注编辑 state（已报名学生可随时修改）
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  // 课时消耗表单 state
  const [consumeOpen, setConsumeOpen] = useState(false);
  const [consumeMinutes, setConsumeMinutes] = useState(45); // 默认一节课 45 分钟
  const [consumeNote, setConsumeNote] = useState('');
  const [consuming, setConsuming] = useState(false);
  const [consumeErr, setConsumeErr] = useState<string | null>(null);

  // 删除学生 state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  async function reload() {
    const r = await api.get<Detail>(`/students/${id}`);
    setData(r.data);
  }

  async function submitDelete() {
    setDeleteErr(null);
    setDeleting(true);
    try {
      await api.delete(`/students/${id}`);
      nav('/dashboard');
    } catch (e) {
      setDeleteErr(apiError(e));
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<Detail>(`/students/${id}`);
        setData(r.data);
      } catch (e) {
        setErr(apiError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function submitEnroll() {
    setEnrollErr(null);
    setEnrolling(true);
    try {
      await api.post(`/students/${id}/enroll`, { initial_minutes: enrollMinutes });
      setEnrollOpen(false);
      await reload();
    } catch (e) {
      setEnrollErr(apiError(e));
    } finally {
      setEnrolling(false);
    }
  }

  async function submitConsume() {
    setConsumeErr(null);
    setConsuming(true);
    try {
      await api.post(`/students/${id}/consume-lesson`, { minutes: consumeMinutes, note: consumeNote || undefined });
      setConsumeOpen(false);
      setConsumeNote('');
      await reload();
    } catch (e) {
      setConsumeErr(apiError(e));
    } finally {
      setConsuming(false);
    }
  }

  // data 变化时同步 noteDraft（仅当用户未在编辑时）
  useEffect(() => {
    if (data && !noteSaving) {
      setNoteDraft(data.student.notes ?? '');
    }
  }, [data?.student.notes]);

  // 保存备注：失焦时触发
  async function saveNote() {
    if (noteDraft === (data?.student.notes ?? '')) return; // 无变化不提交
    setNoteSaving(true);
    setNoteSaved(false);
    try {
      await api.patch(`/students/${id}`, { notes: noteDraft });
      await reload();
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    } catch (e) {
      // 失败时回滚
      setNoteDraft(data?.student.notes ?? '');
    } finally {
      setNoteSaving(false);
    }
  }

  if (loading) return <Spinner />;
  if (err) return <div className="p-8"><ErrorState message={err} /></div>;
  if (!data) return <Empty title="学生不存在" />;

  const { student, timeline, lesson } = data;

  // 时间线聚合：按 created_at / due_at 升序混合
  type TL = { kind: 'consultation' | 'trial' | 'followup'; time: string; node: React.ReactNode };
  const items: TL[] = [];
  timeline.consultations.forEach((c) =>
    items.push({ kind: 'consultation', time: c.created_at, node: <ConsultationNode c={c} /> }),
  );
  timeline.trials.forEach((t) =>
    items.push({ kind: 'trial', time: t.scheduled_at, node: <TrialNode t={t} /> }),
  );
  timeline.followUps.forEach((f) =>
    items.push({ kind: 'followup', time: f.due_at, node: <FollowUpNode f={f} /> }),
  );
  items.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  return (
    <div className="p-8">
      <PageHeader
        title={student.name}
        desc={`${student.grade ?? '—'} · 家长：${student.parent_name}`}
        action={<StatusBadge status={student.status} />}
      />

      <div className="grid grid-cols-3 gap-5">
        {/* 左：学生信息 */}
        <Card className="p-5 space-y-3">
          <div className="text-sm text-ink-soft">归属：{student.owner_admin_name ?? '—'}</div>
          <Info icon={Phone} label="家长电话" value={student.parent_phone ?? '—'} />
          <Info icon={GraduationCap} label="年级" value={student.grade ?? '—'} />
          <Info icon={Coins} label="课时余额" value={lesson ? `${lesson.balance} 分钟` : '未购课'} />
          {lesson && lesson.total_purchased > 0 && (
            <div className="pt-3 border-t border-gray-200">
              <div className="text-xs text-ink-soft mb-2">课时消耗统计</div>
              {/* 四个统计数字 */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-blue-50 rounded p-2">
                  <div className="text-[10px] text-ink-soft">已购课时</div>
                  <div className="text-sm font-semibold text-blue-700">{lesson.total_purchased} 分钟</div>
                </div>
                <div className="bg-orange-50 rounded p-2">
                  <div className="text-[10px] text-ink-soft">已消耗</div>
                  <div className="text-sm font-semibold text-orange-700">{lesson.total_consumed} 分钟</div>
                </div>
                <div className="bg-green-50 rounded p-2">
                  <div className="text-[10px] text-ink-soft">剩余</div>
                  <div className="text-sm font-semibold text-green-700">{lesson.balance} 分钟</div>
                </div>
                <div className="bg-purple-50 rounded p-2">
                  <div className="text-[10px] text-ink-soft">消耗率</div>
                  <div className="text-sm font-semibold text-purple-700">{lesson.consumption_rate}%</div>
                </div>
              </div>
              {/* 进度条 */}
              <div className="mb-3">
                <div className="flex justify-between text-[10px] text-ink-soft mb-0.5">
                  <span>0</span>
                  <span>{lesson.total_purchased} 分钟</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${lesson.consumption_rate >= 80 ? 'bg-red-500' : lesson.consumption_rate >= 50 ? 'bg-orange-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(lesson.consumption_rate, 100)}%` }}
                  />
                </div>
                <div className="text-[10px] text-ink-soft mt-0.5 text-right">
                  {lesson.consumption_rate >= 80 ? '课时消耗较快，建议尽快续费' : lesson.consumption_rate >= 50 ? '课时过半，关注续费时机' : '课时充足'}
                </div>
              </div>
              {/* 最近交易记录 */}
              {lesson.recent_transactions.length > 0 && (
                <div>
                  <div className="text-[10px] text-ink-soft mb-1">最近交易记录（最多 10 条）</div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {lesson.recent_transactions.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1">
                        <div className="flex-1 min-w-0">
                          <span className={`font-medium ${tx.delta_min > 0 ? 'text-green-700' : 'text-red-600'}`}>
                            {tx.delta_min > 0 ? '+' : ''}{tx.delta_min}
                          </span>
                          <span className="text-ink-soft ml-2 text-[11px]">
                            {tx.reason === 'purchase' ? '购入' : tx.reason === 'consume' ? '消耗' : '退回'}
                          </span>
                          {tx.note && <span className="text-ink ml-1 truncate text-[11px]">· {tx.note}</span>}
                        </div>
                        <span className="text-[10px] text-ink-soft ml-2 whitespace-nowrap">
                          {new Date(tx.created_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-ink-soft">备注</div>
              {student.status === 'enrolled' && (
                <span className="text-[10px] text-ink-soft">
                  {noteSaving ? '保存中…' : noteSaved ? '已保存' : '失焦自动保存'}
                </span>
              )}
            </div>
            {student.status === 'enrolled' ? (
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onBlur={saveNote}
                maxLength={500}
                rows={3}
                placeholder="可随时修改备注，如：家长偏好 / 学习进度 / 续费意向…"
                className="input resize-none"
              />
            ) : student.notes ? (
              <div className="text-sm text-ink p-2 bg-gray-50 rounded whitespace-pre-wrap">{student.notes}</div>
            ) : (
              <div className="text-sm text-ink-soft p-2 bg-gray-50 rounded">—</div>
            )}
          </div>
          <div className="pt-2 border-t border-gray-200">
            <div className="text-xs text-ink-soft mb-2">快捷操作</div>
            {student.status === 'trial_done' && (
              <button
                onClick={() => setEnrollOpen((v) => !v)}
                className="w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors mb-2"
              >
                <UserCheck className="w-3.5 h-3.5" /> 确认报名
              </button>
            )}
            {enrollOpen && (
              <div className="mb-2 p-2 rounded border border-emerald-200 bg-emerald-50/50">
                <div className="text-xs text-ink-soft mb-1">首次购课分钟数</div>
                <input
                  type="number"
                  min={0}
                  max={6000}
                  step={30}
                  value={enrollMinutes}
                  onChange={(e) => setEnrollMinutes(Number(e.target.value))}
                  className="input"
                />
                <div className="text-[11px] text-ink-soft mt-1">约 {Math.floor(enrollMinutes / 60)} 小时 · 0 表示只建档不购课；30 天后续费跟进会自动建任务</div>
                {enrollErr && <div className="text-xs text-bad mt-1">{enrollErr}</div>}
                <div className="flex gap-2 mt-2">
                  <Button variant="secondary" onClick={() => setEnrollOpen(false)} disabled={enrolling} className="text-xs">取消</Button>
                  <Button onClick={submitEnroll} loading={enrolling} className="text-xs">确认报名</Button>
                </div>
              </div>
            )}
            {student.status === 'enrolled' && lesson && (
              <>
                <button
                  onClick={() => setConsumeOpen((v) => !v)}
                  className="w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors mb-2"
                >
                  <Clock className="w-3.5 h-3.5" /> 登记课时消耗
                </button>
                {consumeOpen && (
                  <div className="mb-2 p-2 rounded border border-amber-200 bg-amber-50/50">
                    <div className="text-xs text-ink-soft mb-1">消耗分钟数（当前余额 {lesson.balance} 分钟）</div>
                    <input
                      type="number"
                      min={1}
                      max={480}
                      step={15}
                      value={consumeMinutes}
                      onChange={(e) => setConsumeMinutes(Number(e.target.value))}
                      className="input"
                    />
                    <div className="flex gap-1 mt-1.5">
                      {[30, 45, 60, 90, 120].map((m) => (
                        <button
                          key={m}
                          onClick={() => setConsumeMinutes(m)}
                          className={`text-[10px] px-2 py-0.5 rounded border ${consumeMinutes === m ? 'bg-amber-200 border-amber-400 text-amber-900' : 'bg-white border-gray-200 text-ink-soft hover:bg-amber-50'}`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      placeholder="备注（如：第 3 次课 / 补课）"
                      value={consumeNote}
                      onChange={(e) => setConsumeNote(e.target.value)}
                      maxLength={200}
                      className="input mt-2"
                    />
                    <div className="text-[11px] text-ink-soft mt-1">
                      消耗后余额：{Math.max(lesson.balance - consumeMinutes, 0)} 分钟
                      {lesson.balance - consumeMinutes < 0 && <span className="text-bad ml-1">（余额不足！）</span>}
                    </div>
                    {consumeErr && <div className="text-xs text-bad mt-1">{consumeErr}</div>}
                    <div className="flex gap-2 mt-2">
                      <Button variant="secondary" onClick={() => setConsumeOpen(false)} disabled={consuming} className="text-xs">取消</Button>
                      <Button onClick={submitConsume} loading={consuming} className="text-xs bg-amber-600 hover:bg-amber-700">确认消耗</Button>
                    </div>
                  </div>
                )}
              </>
            )}
            <Link
              to={`/trials/schedule?student_id=${student.id}`}
              className="block text-xs text-brand hover:underline"
            >
              → 安排试听
            </Link>
            <Link to="/follow-ups" className="block text-xs text-brand hover:underline mt-1">→ 跟进工作台</Link>

            <button
              onClick={() => setDeleteOpen((v) => !v)}
              className="w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors mt-3"
            >
              <Trash2 className="w-3.5 h-3.5" /> 删除学生
            </button>
            {deleteOpen && (
              <div className="mt-2 p-2 rounded border border-red-200 bg-red-50/50">
                <div className="text-xs text-red-700 font-medium mb-1">确认删除？</div>
                <div className="text-[11px] text-ink-soft mb-2">
                  将一并清除该学生的所有关联数据：{data?.timeline.consultations.length ?? 0} 条咨询、{data?.timeline.trials.length ?? 0} 条试听、{data?.timeline.followUps.length ?? 0} 条跟进{(data?.lesson?.balance ?? 0) > 0 ? `、${data?.lesson?.balance} 分钟课时余额` : ''}。此操作不可撤销。
                </div>
                {deleteErr && <div className="text-xs text-bad mb-1">{deleteErr}</div>}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleting} className="text-xs">取消</Button>
                  <Button onClick={submitDelete} loading={deleting} className="text-xs bg-red-600 hover:bg-red-700">确认删除</Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* 右：时间线 */}
        <Card className="col-span-2 p-5">
          <h2 className="font-medium text-ink mb-4">时间线</h2>
          {items.length === 0 ? (
            <Empty title="暂无记录" hint="登记咨询 / 安排试听后会在这里显示" />
          ) : (
            <ol className="relative border-l border-gray-200 ml-2">
              {items.map((it, i) => (
                <li key={i} className="ml-4 mb-5 last:mb-0">
                  <div className="absolute -left-1.5 w-3 h-3 rounded-full bg-brand mt-1" />
                  <div className="text-xs text-ink-soft mb-1">{new Date(it.time).toLocaleString('zh-CN')}</div>
                  {it.node}
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="w-4 h-4 text-ink-soft" />
      <span className="text-ink-soft">{label}：</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}

function ConsultationNode({ c }: { c: Consultation }) {
  return (
    <div className="p-2 bg-gray-50 rounded">
      <div className="text-sm text-ink flex items-center gap-2">
        <FileText className="w-3.5 h-3.5 text-gray-500" />
        <span>咨询登记</span>
        <span className="text-xs text-ink-soft">渠道：{c.channel} · 来源：{c.source ?? '—'}</span>
      </div>
      {c.need && <div className="text-xs text-ink-soft mt-1">需求：{c.need}</div>}
    </div>
  );
}

function TrialNode({ t }: { t: TrialBooking }) {
  return (
    <div className="p-2 bg-blue-50 rounded">
      <div className="text-sm text-ink flex items-center gap-2">
        <Calendar className="w-3.5 h-3.5 text-blue-700" />
        <span>试听 · {t.teacher_name ?? '—'}</span>
        <span className="text-xs text-ink-soft">{new Date(t.scheduled_at).toLocaleString('zh-CN')}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${t.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : t.status === 'cancelled' ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-ink'}`}>
          {t.status === 'completed' ? '已完成' : t.status === 'cancelled' ? '已取消' : '待上课'}
        </span>
        {t.recommendation && <RecBadge rec={t.recommendation} />}
      </div>
      {t.feedback_text && (
        <div className="text-xs text-ink-soft mt-1 line-clamp-2">{t.feedback_text}</div>
      )}
      {t.status === 'pending' && (
        <Link to={`/trials/${t.id}/feedback`} className="inline-flex items-center gap-1 text-xs text-brand mt-1 hover:underline">
          <Sparkles className="w-3 h-3" /> 去填反馈 / AI 抽取
        </Link>
      )}
    </div>
  );
}

function FollowUpNode({ f }: { f: FollowUp }) {
  return (
    <div className={`p-2 rounded ${f.done_at ? 'bg-emerald-50' : 'bg-amber-50'}`}>
      <div className="text-sm text-ink flex items-center gap-2">
        <MessageSquare className="w-3.5 h-3.5 text-amber-700" />
        <span>跟进 · {f.type === 'after_trial' ? '试听后' : f.type === 'renewal' ? '续费' : '流失'}</span>
        {f.done_at && <span className="text-xs text-emerald-700">已完成</span>}
      </div>
      <div className="text-xs text-ink-soft mt-1">{f.content}</div>
      {f.next_action && <div className="text-xs text-ink mt-1">下一步：{f.next_action}</div>}
    </div>
  );
}
