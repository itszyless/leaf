const suffixes = ['', 'k', 'm', 'b', 't', 'q', 'qt', 'sx', 'sp', 'oc', 'no', 'dc', 'ud', 'dd', 'td', 'qd', 'qtd', 'sxd', 'spd', 'od', 'nd'];
function abbreviate(num, mode = 'suffix') {
  const n = Number(num || 0);
  if (!Number.isFinite(n)) return '0';
  const sign = n < 0 ? '-' : '';
  let value = Math.abs(n);
  let i = 0;
  while (value >= 1000 && i < suffixes.length - 1) { value /= 1000; i++; }
  const out = i === 0 ? String(Math.floor(value)) : value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2).replace(/\.0+$|(?<=\.\d)0+$/g, '');
  return sign + out + suffixes[i];
}
module.exports = { abbreviate };
