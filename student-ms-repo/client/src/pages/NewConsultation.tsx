// 登记咨询 — 同时建学生 + 咨询记录
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiError } from '../api/client';
import { Button, PageHeader, Card } from '../components/ui';
import type { ConsultationChannel, Student } from '@sms/shared';

export function NewConsultation() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    student_name: '',
    parent_name: '',
    parent_phone: '',
    grade: '',
    notes: '',
    channel: 'wechat' as ConsultationChannel,
    source: '',
    need: '',
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm({ ...form, [k]: v });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const payload = {
        student_name: form.student_name.trim(),
        parent_name: form.parent_name.trim(),
        parent_phone: form.parent_phone.trim() || undefined,
        grade: form.grade.trim() || undefined,
        notes: form.notes.trim() || undefined,
        channel: form.channel,
        source: form.source.trim() || undefined,
        need: form.need.trim() || undefined,
      };
      const r = await api.post<Student>('/students', payload);
      nav(`/students/${r.data.id}`);
    } catch (e) {
      setErr(apiError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <PageHeader title="登记咨询" desc="新咨询登记后，学生状态自动为「咨询中」，可立即安排试听。" />
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="学生姓名" required>
              <input className="input" value={form.student_name} onChange={(e) => set('student_name', e.target.value)} required maxLength={50} />
            </Field>
            <Field label="家长姓名" required>
              <input className="input" value={form.parent_name} onChange={(e) => set('parent_name', e.target.value)} required maxLength={50} />
            </Field>
            <Field label="家长电话">
              <input
                className="input"
                value={form.parent_phone}
                onChange={(e) => set('parent_phone', e.target.value.replace(/\D/g, ''))}
                maxLength={11}
                pattern="^1[3-9]\d{9}$"
                inputMode="numeric"
                placeholder="11 位手机号（1 开头）"
              />
              {form.parent_phone && form.parent_phone.length > 0 && form.parent_phone.length < 11 && (
                <div className="text-[11px] text-bad mt-0.5">还需 {11 - form.parent_phone.length} 位（共 11 位）</div>
              )}
              {form.parent_phone.length === 11 && !/^1[3-9]\d{9}$/.test(form.parent_phone) && (
                <div className="text-[11px] text-bad mt-0.5">格式错误：必须是 1 开头、第二位 3-9 的 11 位手机号</div>
              )}
            </Field>
            <Field label="年级">
              <input className="input" value={form.grade} onChange={(e) => set('grade', e.target.value)} maxLength={20} placeholder="例：三年级" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="咨询渠道">
              <select className="input" value={form.channel} onChange={(e) => set('channel', e.target.value as ConsultationChannel)}>
                <option value="wechat">微信</option>
                <option value="call">电话</option>
                <option value="walkin">到店</option>
              </select>
            </Field>
            <Field label="来源">
              <input className="input" value={form.source} onChange={(e) => set('source', e.target.value)} placeholder="例：家长介绍 / 百度广告" />
            </Field>
          </div>

          <Field label="需求">
            <input className="input" value={form.need} onChange={(e) => set('need', e.target.value)} placeholder="例：数学跟不上 / 小升初冲刺" />
          </Field>

          <Field label="备注">
            <textarea className="input min-h-[80px]" value={form.notes} onChange={(e) => set('notes', e.target.value)} maxLength={500} />
          </Field>

          {err && <div className="text-sm text-bad p-2 bg-bad-soft rounded">{err}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => nav(-1)}>取消</Button>
            <Button type="submit" loading={loading}>保存</Button>
          </div>
        </form>
      </Card>

    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-ink-soft mb-1">
        {label} {required && <span className="text-bad">*</span>}
      </label>
      {children}
    </div>
  );
}
