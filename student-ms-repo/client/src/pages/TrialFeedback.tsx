// 老师试听反馈 + AI 抽取 — 关键 LLM 落地点
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Sparkles, Save, CheckCircle2, AlertTriangle, Wand2 } from 'lucide-react';
import { api, apiError } from '../api/client';
import { Button, PageHeader, Card, Spinner, RecBadge, EngagementTag } from '../components/ui';
import type { TrialBooking, ExtractedFeedback } from '@sms/shared';

export function TrialFeedback() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [trial, setTrial] = useState<TrialBooking | null>(null);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedFeedback | null>(null);
  const [followUpCreated, setFollowUpCreated] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showComplete, setShowComplete] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<{ items: TrialBooking[] }>('/trials', { params: { student: undefined } });
        const t = r.data.items.find((x) => x.id === Number(id));
        if (!t) {
          setErr('试听不存在');
          return;
        }
        setTrial(t);
        setFeedback(t.feedback_text ?? '');
        // 防御：extracted_feedback 可能是 JSON 字符串（旧数据）或对象
        if (t.extracted_feedback) {
          const ef = t.extracted_feedback;
          setExtracted(typeof ef === 'string' ? JSON.parse(ef) : ef);
        }
      } catch (e) {
        setErr(apiError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function saveFeedback() {
    if (!trial) return;
    setSaving(true);
    setErr(null);
    try {
      await api.post(`/trials/${trial.id}/feedback`, { feedback_text: feedback });
      setTrial({ ...trial, feedback_text: feedback });
    } catch (e) {
      setErr(apiError(e));
    } finally {
      setSaving(false);
    }
  }

  async function extract() {
    if (!trial) return;
    setExtracting(true);
    setErr(null);
    setExtracted(null);
    try {
      // 必须先保存反馈
      if (trial.feedback_text !== feedback) {
        await api.post(`/trials/${trial.id}/feedback`, { feedback_text: feedback });
        setTrial({ ...trial, feedback_text: feedback });
      }
      const r = await api.post<{ extracted: ExtractedFeedback; followUpCreated: boolean }>(
        `/ai/trials/${trial.id}/extract-feedback`,
      );
      setExtracted(r.data.extracted);
      setFollowUpCreated(r.data.followUpCreated);
    } catch (e) {
      setErr(apiError(e));
    } finally {
      setExtracting(false);
    }
  }

  async function markComplete() {
    if (!trial) return;
    setSaving(true);
    try {
      await api.post(`/trials/${trial.id}/complete`);
      setShowComplete(true);
      setTrial({ ...trial, status: 'completed' });
    } catch (e) {
      setErr(apiError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;
  if (err && !trial) return <div className="p-8 text-bad">{err}</div>;
  if (!trial) return <div className="p-8">试听不存在</div>;

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader
        title="试听反馈"
        desc={`${trial.student_name ?? '—'} · 安排时间 ${new Date(trial.scheduled_at).toLocaleString('zh-CN')} · 状态：${trial.status}`}
      />

      <div className="grid grid-cols-2 gap-5">
        {/* 左：老师反馈 */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-ink">老师反馈（自由文本）</h2>
            <Button variant="secondary" onClick={saveFeedback} loading={saving} disabled={!feedback.trim()}>
              <Save className="w-4 h-4" /> 保存
            </Button>
          </div>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="请描述学生课堂表现：参与度、强弱项、是否适合报名…"
            className="w-full min-h-[280px] p-3 border border-gray-300 rounded text-sm focus:outline-none focus:border-brand"
            maxLength={2000}
          />
          <div className="mt-2 text-xs text-ink-soft flex justify-between">
            <span>{feedback.length} / 2000</span>
            <span>反馈越具体，AI 抽取越准</span>
          </div>

          <div className="mt-4 flex gap-2">
            <Button onClick={extract} loading={extracting} disabled={!feedback.trim() || feedback.length < 10}>
              <Wand2 className="w-4 h-4" /> AI 抽取结构化结果
            </Button>
            {trial.status === 'pending' && (
              <Button variant="secondary" onClick={markComplete} loading={saving}>
                <CheckCircle2 className="w-4 h-4" /> 标记试听完成
              </Button>
            )}
          </div>

          {err && <div className="mt-3 text-sm text-bad p-2 bg-bad-soft rounded">{err}</div>}
          {showComplete && (
            <div className="mt-3 text-sm text-good p-2 bg-good-soft rounded">已标记完成。学生状态会自动变为「试听完成」。</div>
          )}
        </Card>

        {/* 右：AI 抽取结果 */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-ink flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand" /> AI 抽取结果
            </h2>
            {extracted && <RecBadge rec={extracted.recommendation} />}
          </div>

          {!extracted && !extracting && (
            <div className="text-center py-12 text-ink-soft">
              <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <div className="text-sm">点击「AI 抽取结构化结果」开始</div>
              <div className="text-xs mt-1">调用 DeepSeek，失败时会自动降级为「待人工」</div>
            </div>
          )}

          {extracting && <Spinner label="AI 抽取中…" />}

          {extracted && (
            <div className="space-y-3">
              {extracted._degraded && (
                <div className="flex items-start gap-2 p-2 bg-warn-soft border-l-2 border-warn rounded text-xs text-warn">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />
                  <div>本次 AI 抽取失败，已降级为「待人工」状态。原因：服务端会记录。你可以手动判定结果。</div>
                </div>
              )}
              <div>
                <EngagementTag e={extracted.engagement} />
              </div>
              <div>
                <div className="text-xs text-ink-soft mb-1">优势</div>
                {(extracted.strengths?.length ?? 0) === 0 ? (
                  <div className="text-sm text-ink-soft">—</div>
                ) : (
                  <ul className="text-sm text-ink space-y-0.5">
                    {extracted.strengths!.map((s, i) => <li key={i}>· {s}</li>)}
                  </ul>
                )}
              </div>
              <div>
                <div className="text-xs text-ink-soft mb-1">待改进</div>
                {(extracted.weaknesses?.length ?? 0) === 0 ? (
                  <div className="text-sm text-ink-soft">—</div>
                ) : (
                  <ul className="text-sm text-ink space-y-0.5">
                    {extracted.weaknesses!.map((s, i) => <li key={i}>· {s}</li>)}
                  </ul>
                )}
              </div>
              <div>
                <div className="text-xs text-ink-soft mb-1">跟进建议（已写入跟进任务）</div>
                <div className="text-sm text-ink p-2 bg-gray-50 rounded">{extracted.follow_up_suggestion}</div>
              </div>
              {followUpCreated && (
                <div className="text-xs text-good">已自动在 admin 工作台创建一条跟进任务</div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
