/**
 * The Almanac's pictures as plain SVG / HTML strings (no canvas, no per-frame work): a radar, score bars and a
 * sparkline. Every chart carries its numbers as text (labels and an aria-label), and two series never differ by colour
 * alone: the first is a solid blue outline with round dots, the second a dashed orange one with square dots.
 * Callers pass text that is already localized and escaped.
 */
export const SERIES = [{ stroke: '#1c6fb8', fill: 'rgba(41,133,214,.26)', dash: '' }, { stroke: '#c2540a', fill: 'rgba(240,138,40,.16)', dash: '5 3' }] as const;
const r1 = (n: number) => Math.round(n * 10) / 10;
export interface RadarSeries { values: readonly number[]; name: string }
export interface RadarOptions { labels: readonly string[]; series: readonly RadarSeries[]; size?: number; /** Small: no axis labels (the caller shows the numbers beside it). */ compact?: boolean; title: string }
/** A radar of scores 0-100. With labels it is 320 x 250 units; compact it is a square of dots and outlines. */
export function radarSvg({ labels, series, compact = false, title }: RadarOptions): string {
  const n = labels.length, w = compact ? 120 : 320, h = compact ? 120 : 250, cx = w / 2, cy = compact ? 60 : 126, R = compact ? 52 : 82;
  const at = (i: number, value: number) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n, r = R * Math.max(0, Math.min(100, value)) / 100; return [r1(cx + Math.cos(a) * r), r1(cy + Math.sin(a) * r)] as const; };
  const ringPath = (value: number) => labels.map((_, i) => at(i, value).join(',')).join(' ');
  const grid = [25, 50, 75, 100].map(v => `<polygon points="${ringPath(v)}" fill="${v === 100 ? '#fffdf6' : 'none'}" stroke="#e2cf9f" stroke-width="${v === 100 ? 1.5 : 1}"/>`).reverse().join('')
    + labels.map((_, i) => { const [x, y] = at(i, 100); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e2cf9f" stroke-width="1"/>`; }).join('');
  const shapes = series.map((s, k) => { const look = SERIES[k % SERIES.length], pts = s.values.map((v, i) => at(i, v));
    const dots = pts.map(([x, y]) => k % 2 ? `<rect x="${r1(x - 2.6)}" y="${r1(y - 2.6)}" width="5.2" height="5.2" fill="${look.stroke}"/>` : `<circle cx="${x}" cy="${y}" r="${compact ? 2.4 : 3}" fill="${look.stroke}"/>`).join('');
    return `<polygon points="${pts.map(p => p.join(',')).join(' ')}" fill="${look.fill}" stroke="${look.stroke}" stroke-width="2" stroke-linejoin="round"${look.dash ? ` stroke-dasharray="${look.dash}"` : ''}/>${dots}`; }).join('');
  const text = compact ? '' : labels.map((label, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n, x = cx + Math.cos(a) * (R + 12), y = cy + Math.sin(a) * (R + 14), anchor = Math.abs(Math.cos(a)) < .3 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
    const numbers = series.map((s, k) => `<tspan fill="${SERIES[k % SERIES.length].stroke}" font-weight="900">${Math.round(s.values[i])}</tspan>`).join('<tspan fill="#7f8a73"> · </tspan>');
    return `<text x="${r1(x)}" y="${r1(y - 3)}" text-anchor="${anchor}" font-size="12" font-weight="800" fill="#2c3a26">${label}</text><text x="${r1(x)}" y="${r1(y + 11)}" text-anchor="${anchor}" font-size="12">${numbers}</text>`; }).join('');
  const spoken = series.map(s => `${s.name}: ${labels.map((label, i) => `${label} ${Math.round(s.values[i])}`).join(', ')}`).join('. ');
  return `<svg class="ins-radar${compact ? ' compact' : ''}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}. ${spoken}" preserveAspectRatio="xMidYMid meet">${grid}${shapes}${text}</svg>`;
}
/** The legend for a two-series chart: a line sample (solid / dashed), a dot shape and the name. */
export function legendHtml(names: readonly string[]): string {
  return `<div class="ins-legend">${names.map((name, k) => { const look = SERIES[k % SERIES.length];
    return `<span><svg viewBox="0 0 34 12" width="34" height="12" aria-hidden="true"><line x1="1" y1="6" x2="33" y2="6" stroke="${look.stroke}" stroke-width="2.5"${look.dash ? ` stroke-dasharray="${look.dash}"` : ''}/>${k % 2 ? `<rect x="14" y="3" width="6" height="6" fill="${look.stroke}"/>` : `<circle cx="17" cy="6" r="3.2" fill="${look.stroke}"/>`}</svg>${name}</span>`; }).join('')}</div>`;
}
export interface BarRow { label: string; value: number; /** A second value drawn as a marker (the comparison). */ other?: number; note?: string; tag?: string; tone?: 'strong' | 'weak' | '' ; icon?: string }
/** Horizontal score bars 0-100: label, bar, number; strong and weak rows carry a text tag, not only a colour. */
export function barsHtml(rows: readonly BarRow[], title: string): string {
  return `<div class="ins-bars" role="list" aria-label="${title}">${rows.map(row => {
    const v = Math.max(0, Math.min(100, Math.round(row.value))), o = row.other === undefined ? null : Math.max(0, Math.min(100, Math.round(row.other)));
    return `<div class="ins-bar ${row.tone ?? ''}" role="listitem"><div class="ins-bar-head"><span class="ins-bar-label">${row.icon ? `<i aria-hidden="true">${row.icon}</i> ` : ''}${row.label}${row.tag ? ` <em>${row.tag}</em>` : ''}</span><b>${v}${o === null ? '' : `<small> · ${o}</small>`}</b></div>`
      + `<div class="ins-bar-track" aria-hidden="true"><i style="width:${v}%"></i>${o === null ? '' : `<u style="left:${o}%"></u>`}</div>${row.note ? `<p>${row.note}</p>` : ''}</div>`; }).join('')}</div>`;
}
/** A small line of values over time with its first and last value written out; `label` is its spoken summary. */
export function sparkSvg(values: readonly number[], label: string, color = '#1c6fb8'): string {
  const w = 160, h = 44, pad = 5, lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => [r1(pad + (values.length < 2 ? .5 : i / (values.length - 1)) * (w - 2 * pad)), r1(h - pad - (v - lo) / span * (h - 2 * pad))] as const);
  const last = pts[pts.length - 1];
  return `<svg class="ins-spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}" preserveAspectRatio="none"><polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>${last ? `<circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="${color}"/>` : ''}</svg>`;
}
