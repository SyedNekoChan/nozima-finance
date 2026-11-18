import { useEffect, useMemo, useRef, useState } from 'react';
import { compact } from '../lib/format.js';
import { formatAmount } from '../lib/currency.js';
import { Amount } from './AnimatedAmount.jsx';

/*
 * Spending over time: one bar per period (day, month or year), never
 * interpolated between periods. The current period is white, past periods
 * graphite. Against the reference the bars carry the app's money colours:
 * days over the allowance amber, over twice it red; months over the budget red.
 *
 * Read a value by hovering, tapping, or focusing the chart and using the
 * arrow keys. Bars grow in once per data change (instantly under reduced
 * motion: the --motion-data token is 0ms there).
 */
const PAD = { l: 44, r: 8, t: 12, b: 28 };

function niceCeil(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function barPath(x, y, w, h, r) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export default function SpendingChart({ data, ticks, tips, reference, currency = 'UZS', label = 'Spending', overTone = 'caution' }) {
  const boxRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [sel, setSel] = useState(null);
  const [grown, setGrown] = useState(false);
  const n = data.length;
  const key = data.map((v) => Math.round(v)).join(',');

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setBox((b) => (Math.round(b.w) === Math.round(width) && Math.round(b.h) === Math.round(height) ? b : { w: Math.round(width), h: Math.round(height) }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // grow the bars in on every new data set
  useEffect(() => {
    setGrown(false);
    setSel(null);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setGrown(true)));
    return () => cancelAnimationFrame(raf);
  }, [key]);

  const { w, h } = box;
  const plotW = Math.max(0, w - PAD.l - PAD.r);
  const plotH = Math.max(0, h - PAD.t - PAD.b);
  const max = Math.max(0, ...data);
  const refValue = reference && reference.value > 0 ? reference.value : null;
  const ceil = useMemo(() => niceCeil(Math.max(max, refValue ? refValue * 1.08 : 0)), [max, refValue]);
  const band = n ? plotW / n : 0;
  const barW = Math.max(2, Math.min(band * 0.64, 28));
  const y = (v) => PAD.t + plotH - (Math.min(v, ceil) / ceil) * plotH;
  const bx = (i) => PAD.l + i * band + (band - barW) / 2;

  const pick = (clientX) => {
    const r = boxRef.current.getBoundingClientRect();
    const i = Math.floor((clientX - r.left - PAD.l) / band);
    setSel(i >= 0 && i < n ? i : null);
  };

  const total = data.reduce((a, b) => a + b, 0);
  const summary = `${label}: ${n} periods, ${formatAmount(total, currency)} in total, highest ${formatAmount(max, currency)}.`;

  const tipIndex = sel;
  const tipX = tipIndex !== null ? PAD.l + tipIndex * band + band / 2 : 0;

  return (
    <div
      ref={boxRef}
      className="relative w-full h-full min-h-[200px] lg:min-h-[160px] select-none touch-pan-y"
      onPointerMove={(e) => e.pointerType === 'mouse' && pick(e.clientX)}
      onPointerDown={(e) => pick(e.clientX)}
      onMouseLeave={() => setSel(null)}
    >
      {w > 0 && h > 0 && (
        <svg
          width={w}
          height={h}
          className="block overflow-visible focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent rounded"
          role="img"
          aria-label={summary}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              setSel((s) => {
                const base = s === null ? n - 1 : s;
                return Math.max(0, Math.min(n - 1, base + (e.key === 'ArrowRight' ? 1 : -1)));
              });
            } else if (e.key === 'Escape') setSel(null);
          }}
          onBlur={() => setSel(null)}
        >
          {/* grid: 0, half, top */}
          {[0, 0.5, 1].map((f) => {
            const gy = PAD.t + plotH - f * plotH;
            return (
              <g key={f}>
                <line x1={PAD.l} x2={w - PAD.r} y1={gy} y2={gy} stroke="rgb(255 255 255 / 0.07)" strokeDasharray={f === 0 ? undefined : '2 4'} />
                <text x={PAD.l - 10} y={gy + 4} textAnchor="end" className="fill-[rgb(var(--ink-3))] tnum" fontSize="12">
                  {compact(ceil * f)}
                </text>
              </g>
            );
          })}

          {/* bars */}
          {data.map((v, i) => {
            const top = y(v);
            const bh = PAD.t + plotH - top;
            const current = i === n - 1;
            const over = refValue !== null && v > refValue;
            const far = refValue !== null && v > refValue * 2;
            const dim = tipIndex !== null && tipIndex !== i;
            const fill = far || (over && overTone === 'negative')
              ? 'rgb(var(--negative))'
              : over
                ? 'rgb(var(--caution))'
                : current
                  ? 'rgb(var(--ink))'
                  : 'rgb(var(--ink) / 0.42)';
            return (
              <path
                key={i}
                d={barPath(bx(i), top, barW, Math.max(bh, v > 0 ? 2 : 0), 3)}
                fill={fill}
                opacity={dim ? 0.45 : 1}
                style={{
                  transformBox: 'fill-box',
                  transformOrigin: 'bottom',
                  transform: grown ? 'scaleY(1)' : 'scaleY(0)',
                  transition: `transform var(--motion-data) var(--motion-ease) ${Math.min(i * 12, 240)}ms, opacity var(--motion-micro) var(--motion-ease)`,
                }}
              />
            );
          })}

          {/* the reference: the daily allowance or the budget */}
          {refValue !== null && refValue <= ceil && (
            <g>
              <line x1={PAD.l} x2={w - PAD.r} y1={y(refValue)} y2={y(refValue)} stroke="rgb(var(--ink) / 0.55)" strokeDasharray="4 4" />
              <rect x={PAD.l + 2} y={y(refValue) - 9} width={reference.label.length * 7 + 44} height={18} rx={4} fill="rgb(var(--raised))" stroke="rgb(255 255 255 / 0.12)" />
              <text x={PAD.l + 9} y={y(refValue) + 4} className="fill-[rgb(var(--ink-2))]" fontSize="12">
                {reference.label} {compact(refValue)}
              </text>
            </g>
          )}

          {/* x labels */}
          {ticks.map((t, i) =>
            t ? (
              <text
                key={i}
                x={PAD.l + i * band + band / 2}
                y={h - 8}
                textAnchor="middle"
                className={`tnum ${i === n - 1 ? 'fill-[rgb(var(--ink))]' : 'fill-[rgb(var(--ink-3))]'}`}
                fontSize="12"
              >
                {t}
              </text>
            ) : null
          )}

          {tipIndex !== null && (
            <line x1={tipX} x2={tipX} y1={PAD.t} y2={PAD.t + plotH} stroke="rgb(255 255 255 / 0.14)" />
          )}
        </svg>
      )}

      {/* the readout */}
      {tipIndex !== null && w > 0 && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 px-3 py-2 rounded bg-raised border border-line-strong shadow-[0_8px_24px_-6px_rgb(0_0_0/0.6)] whitespace-nowrap"
          style={{ left: Math.max(0, Math.min(w - 168, tipX - 84)), minWidth: Math.min(168, w), maxWidth: w - Math.max(0, Math.min(w - 168, tipX - 84)) }}
        >
          <div className="text-2xs text-ink-3">{tips[tipIndex]}</div>
          <div className="text-sm font-medium text-ink">
            <Amount value={data[tipIndex]} currency={currency} codeClassName="ml-1 font-mono text-[max(12px,0.8em)] text-ink-3" />
          </div>
          {refValue !== null && data[tipIndex] > refValue && (
            <div className={`text-2xs tnum ${data[tipIndex] > refValue * 2 || overTone === 'negative' ? 'text-negative' : 'text-caution'}`}>
              {compact(data[tipIndex] - refValue)} over {reference.label.toLowerCase()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
