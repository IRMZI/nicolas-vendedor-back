export type PeriodPreset = 'today' | '7d' | '30d' | '90d' | 'custom';

export interface DateRange {
  from: Date;
  to: Date;
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function resolveRange(
  period: PeriodPreset,
  fromInput?: string,
  toInput?: string,
): DateRange {
  const now = new Date();

  if (period === 'custom' && fromInput && toInput) {
    const from = startOfDay(new Date(fromInput));
    const to = endOfDay(new Date(toInput));
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) {
      return { from, to };
    }
  }

  const days = period === 'today' ? 0 : period === '7d' ? 6 : period === '90d' ? 89 : 29;
  return { from: startOfDay(addDays(now, -days)), to: endOfDay(now) };
}

/** Periodo imediatamente anterior, de mesma duracao, para comparativos. */
export function previousRange(range: DateRange): DateRange {
  const durationMs = range.to.getTime() - range.from.getTime();
  const to = new Date(range.from.getTime() - 1);
  const from = new Date(to.getTime() - durationMs);
  return { from, to };
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Lista de datas (YYYY-MM-DD) cobrindo todo o intervalo, para series continuas. */
export function eachDay(range: DateRange): string[] {
  const keys: string[] = [];
  const cursor = startOfDay(range.from);
  const last = startOfDay(range.to);
  while (cursor <= last) {
    keys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

export function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}
