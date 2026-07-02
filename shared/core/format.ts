export function fmtAmount(n: number | string, currency = 'RM'): string {
  const cur = currency || 'RM';
  return (
    cur +
    ' ' +
    Number(n).toLocaleString('en-MY', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}
