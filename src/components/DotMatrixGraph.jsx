import { useEffect, useMemo, useRef, useState } from 'react';

const BRIGHT = '#ffffff';
const DIM = '#444444';
const WAVE = '#999999';
const STEP_MS = 28;

function formatCompact(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return `${Math.round(value)}`;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Dynamic ceiling: one extreme bucket must not flatten the rest, so the
// ceiling is capped at 6x the median of the active buckets (taller columns clip).
function getCeiling(data) {
  const nz = data.filter((v) => v > 0).sort((a, b) => a - b);
  if (nz.length === 0) return 0;
  const max = nz[nz.length - 1];
  if (nz.length < 4) return max;
  return Math.min(max, nz[Math.floor(nz.length / 2)] * 6);
}

function Matrix({ id, data, labels, dayMode, ceiling, clipped, frac, wavePos, cfg, className }) {
  const { W, padX, padR, rows, pitch, top, labelH, fontSize = 11, labelGap = 10, H: fixedH } = cfg;
  const n = data.length;
  const plotW = W - padX - padR;
  const cols = Math.floor(plotW / pitch);
  const H = fixedH || top + rows * pitch + labelH;
  const rBright = pitch * 0.38;
  const rDim = Math.max(0.8, pitch * 0.14);

  const rowY = (r) => H - labelH - (r + 0.5) * pitch;
  const colX = (c) => padX + (c / (cols - 1)) * (plotW - pitch) + pitch / 2;
  const bucketX = (i) => (n > 1 ? padX + pitch / 2 + (i / (n - 1)) * (plotW - pitch) : padX + pitch / 2);

  // Each matrix column samples the series by linear interpolation between buckets.
  const valueAt = (c) => {
    if (n === 1) return data[0];
    const t = (c / (cols - 1)) * (n - 1);
    const i = Math.min(n - 2, Math.floor(t));
    return data[i] + (data[i + 1] - data[i]) * (t - i);
  };

  // DAY labels are "DD MMM"; tick spacing is still measured against the former 5-char "DD.MM" width.
  const maxLen = dayMode ? 5 : Math.max(...labels.map((l) => l.length));
  const step = Math.max(1, Math.ceil((maxLen * fontSize * 0.6 + labelGap) / ((plotW - pitch) / Math.max(1, n - 1))));
  const yTicks = [rows - 1, Math.floor((rows - 1) / 2), 0];

  const shown = Math.min(cols, Math.ceil(frac * cols));
  const waveCol = wavePos === null ? null : Math.round(wavePos * cols);

  const twoLevel = dayMode && cfg.isMobile;
  const monthMarks = [];
  if (twoLevel) {
    labels.forEach((l, i) => {
      if (i === 0 || l.slice(3) !== labels[i - 1].slice(3)) monthMarks.push({ m: l.slice(3), x: bucketX(i) });
    });
    for (let k = monthMarks.length - 2; k >= 0; k--) {
      if (monthMarks[k + 1].x - monthMarks[k].x < 20) monthMarks.splice(k, 1);
    }
  }

  const lit = [];
  const dim = [];
  for (let c = 0; c < shown; c++) {
    const level = ceiling > 0 ? Math.min(rows - 1, Math.round((valueAt(c) / ceiling) * (rows - 1))) : 0;
    const waving = waveCol !== null && c >= waveCol - 2 && c <= waveCol;
    for (let r = 0; r < rows; r++) {
      if (r <= level) {
        lit.push(<circle key={`${c}-${r}`} cx={colX(c)} cy={rowY(r)} r={rBright} />);
      } else {
        dim.push(
          <circle key={`${c}-${r}`} cx={colX(c)} cy={rowY(r)} r={waving ? rBright * 0.6 : rDim} fill={waving ? WAVE : DIM} />
        );
      }
    }
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className={className} role="img" aria-label="Spending dot matrix chart">
      <defs>
        <filter id={`glow-${id}`} x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={pitch * 0.35} result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {yTicks.map((r) => (
        <text key={`y-${r}`} x={0} y={rowY(r) + fontSize * 0.36} fill="#666" fontSize={fontSize} fontFamily="monospace">
          {formatCompact((ceiling * r) / (rows - 1))}
          {r === rows - 1 && clipped ? '+' : ''}
        </text>
      ))}
      <g>{dim}</g>
      <g fill={BRIGHT} filter={`url(#glow-${id})`}>{lit}</g>
      {labels.map((label, i) =>
        (n - 1 - i) % step === 0 ? (
          <text key={`x-${i}`} x={bucketX(i)} y={twoLevel ? H - 9 : H - 3} textAnchor="middle" fill="#666" fontSize={fontSize} fontFamily="monospace">
            {twoLevel ? label.slice(0, 2) : label}
          </text>
        ) : null
      )}
      {monthMarks.map((mk) => (
        <text key={`m-${mk.m}`} x={Math.min(mk.x - 5, W - 14)} y={H - 1.5} fill="#555" fontSize="7" fontFamily="monospace" letterSpacing="0.5">
          {mk.m}
        </text>
      ))}
    </svg>
  );
}

const MOBILE = { W: 360, padX: 26, padR: 16, rows: 14, pitch: 6.4, top: 4, labelH: 18, fontSize: 9, labelGap: 4, isMobile: true };

// Mobile: 1 viewBox unit = 1 CSS px. Pitch and row count adapt to the measured box
// so the matrix fills the available height with round, evenly spaced dots.
function mobileCfg({ w, h }) {
  if (!w || !h) return MOBILE;
  const padX = 26;
  const padR = 16;
  const top = 2;
  const labelH = 18;
  const pitch = Math.min(8, Math.max(5, (w - padX - padR) / 46));
  const rows = Math.max(8, Math.min(60, Math.floor((h - top - labelH) / pitch)));
  return { W: w, H: h, padX, padR, rows, pitch, top, labelH, fontSize: 9, labelGap: 4, isMobile: true };
}
const DESKTOP = { W: 1000, padX: 60, padR: 20, rows: 20, pitch: 8.4, top: 4, labelH: 22 };
const TICKS = 36;

export default function DotMatrixGraph({ data, labels, granularity }) {
  const valid = data && data.length > 0 && labels && labels.length === data.length;
  const n = valid ? data.length : 0;
  const dataKey = valid ? `${n}|${data.map((v) => Math.round(v)).join(',')}` : '';

  const boxRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox((b) => (Math.round(b.w) === Math.round(width) && Math.round(b.h) === Math.round(height) ? b : { w: Math.round(width), h: Math.round(height) }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [valid]);

  const [frac, setFrac] = useState(0);
  const [wavePos, setWavePos] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // First mount prints columns left→right; later data changes sweep a wave instead.
  useEffect(() => {
    if (!valid) return undefined;
    if (prefersReducedMotion()) {
      setFrac(1);
      setWavePos(null);
      setLoaded(true);
      return undefined;
    }
    let tick = 0;
    const printing = !loaded;
    setFrac(printing ? 0 : 1);
    const id = setInterval(() => {
      tick += 1;
      const f = Math.min(1, tick / TICKS);
      if (printing) setFrac(f);
      else setWavePos(tick <= TICKS ? f : null);
      if (tick > TICKS) {
        clearInterval(id);
        setWavePos(null);
        setLoaded(true);
      }
    }, STEP_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  const { ceiling, clipped } = useMemo(() => {
    if (!valid) return { ceiling: 0, clipped: false };
    const c = getCeiling(data);
    return { ceiling: c, clipped: c > 0 && Math.max(...data) > c };
  }, [dataKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!valid) return <div className="text-gray-500 text-sm">[ NO DATA ]</div>;

  const shared = { data, labels, dayMode: granularity === 'DAY', ceiling, clipped, frac: loaded ? 1 : frac, wavePos };

  return (
    <>
      <div ref={boxRef} className="sm:hidden w-full flex-1 min-h-0 relative">
        <Matrix id="m" {...shared} cfg={mobileCfg(box)} className="absolute inset-0 w-full h-full text-white overflow-visible" />
      </div>
      <Matrix id="d" {...shared} cfg={DESKTOP} className="hidden sm:block w-full h-auto text-white overflow-visible" />
    </>
  );
}
