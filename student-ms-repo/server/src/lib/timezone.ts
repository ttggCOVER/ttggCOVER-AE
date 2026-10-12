// Melbourne 时区工具 — 作业硬性要求统一 Australia/Melbourne
// 存储：DB 用 ISO UTC 字符串；展示/输入：Melbourne 本地时间
import { DateTime, Settings, Interval } from 'luxon';
import { env } from '../env.js';

Settings.defaultZoneName = env.TZ;
Settings.throwOnInvalid = true;

export const MELBOURNE_TZ = env.TZ; // 'Australia/Melbourne'

/** 当前 Melbourne 时间 */
export function nowInMelbourne(): DateTime {
  return DateTime.now();
}

/** ISO UTC 字符串（DB 入库） */
export function toUTCISO(local: DateTime): string {
  return local.toUTC().toISO()!;
}

/** 解析 ISO UTC 字符串为 Melbourne DateTime */
export function fromUTC(iso: string): DateTime {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(MELBOURNE_TZ);
}

/** 当前 Melbourne ISO UTC */
export function nowISO(): string {
  return toUTCISO(nowInMelbourne());
}

/** 给一个 weekday + "HH:MM" + 日期参考 → 当周那天的 Melbourne DateTime */
export function weekdayTimeThisWeek(weekday: number, hhmm: string, ref: DateTime = nowInMelbourne()): DateTime {
  // luxon weekday: 1=Mon..7=Sun；DB 用 0=Sun..6=Sat
  const luxonWeekday = weekday === 0 ? 7 : weekday;
  let dt = ref.set({ weekday: luxonWeekday });
  const [h, m] = hhmm.split(':').map(Number);
  dt = dt.set({ hour: h, minute: m, second: 0, millisecond: 0 });
  return dt;
}

/** 两个时间区间是否重叠（端点含 = 即视为重叠） */
export function intervalsOverlap(
  aStart: DateTime, aEnd: DateTime,
  bStart: DateTime, bEnd: DateTime
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Melbourne 显示格式：YYYY-MM-DD HH:mm */
export function fmtDisplay(iso: string): string {
  return fromUTC(iso).toFormat('yyyy-LL-dd HH:mm');
}
export function fmtDisplayShort(iso: string): string {
  return fromUTC(iso).toFormat('MM-dd HH:mm');
}
