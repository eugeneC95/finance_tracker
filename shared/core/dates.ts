/** ISO date string for today (local). */
export function todayStr(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

/** Plain YYYY-MM-DD or Google Sheets datetime ISO. */
export function parseTxDate(dateStr: unknown): Date | null {
  if (dateStr === undefined || dateStr === null || dateStr === '') return null;
  const s = String(dateStr).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T12:00:00');
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
