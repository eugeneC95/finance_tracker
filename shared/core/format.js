/** @param {number} n @param {string} [currency] */
export function fmtAmount(n, currency = 'RM') {
  const cur = currency || 'RM';
  return cur + ' ' + Number(n).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
