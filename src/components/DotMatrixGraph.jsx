import { useEffect, useMemo, useState } from 'react';

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

function Matrix({ data, labels, ceiling, clipped, revealed, wavePos, cfg, className }) {
  const { W, padX, padR, rows, pitchY, top, labelH } = cfg;
  const n = data.length;
  const H = top + rows * pitchY + labelH;
  const pitchX = (W - padX - padR) / n;
  const rBright = Math.min(pitchX, pitchY) * 0.36;
  const rDim = Math.max(0.9, rBright * 0.28);

  const rowY = (r) => top + (rows - 1 - r + 0.5) * pitchY;
  const colX = (i) => padX + (i + 0.5) * pitchX;

  const maxLen = Math.max(...labels.map((l) => l.length));
  const step = Math.max(1, Math.ceil((maxLen * 6.6 + 10) / pitchX));

  const yTicks = [rows - 1, Math.floor((rows - 1) / 2), 0];

  const cells = [];
  for (let i = 0; i < n; i++) {
    if (i >= revealed) break;
    const level = ceiling > 0 ? Math.min(rows - 1, Math.round((data[i] / ceiling) * (rows - 1))) : 0;
    const waving = wavePos !== null && (i === wavePos || i === wavePos - 1);
    for (let r = 0; r < rows; r++) {
      const lit = r <= level;
      cells.push(
        <circle
          key={`${i}-${r}`}
          cx={colX(i)}
          cy={rowY(r)}
          r={lit ? rBright : waving ? rBright * 0.6 : rDim}
          fill={lit ? BRIGHT : waving ? WAVE : DIM}
        />
      );
    }
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className={className} role="img" aria-label="Spending dot matrix chart">
      {yTicks.map((r) => (
        <text key={`y-${r}`} x={0} y={rowY(r) + 4} fill="#666" fontSize="11" fontFamily="monospace">
          {formatCompact((ceiling * r) / (rows - 1))}
          {r === rows - 1 && clipped ? '+' : ''}
        </text>
      ))}
      {cells}
      {labels.map((label, i) =>
        (n - 1 - i) % step === 0 ? (
          <text key={`x-${i}`} x={colX(i)} y={H - 4} textAnchor="middle" fill="#666" fontSize="11" fontFamily="monospace">
            {label}
          </text>
        ) : null
      )}
    </svg>
  );
}

const MOBILE = { W: 360, padX: 34, padR: 6, rows: 10, pitchY: 16, top: 4, labelH: 20 };
const DESKTOP = { W: 1000, padX: 60, padR: 10, rows: 12, pitchY: 14, top: 4, labelH: 22 };

export default function DotMatrixGraph({ data, labels }) {
  const valid = data && data.length > 0 && labels && labels.length === data.length;
  const n = valid ? data.length : 0;
  const dataKey = valid ? `${n}|${data.map((v) => Math.round(v)).join(',')}` : '';

  const [revealed, setRevealed] = useState(0);
  const [wavePos, setWavePos] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // First mount prints columns left→right; later data changes sweep a wave instead.
  useEffect(() => {
    if (!valid) return undefined;
    if (prefersReducedMotion()) {
      setRevealed(n);
      setWavePos(null);
      setLoaded(true);
      return undefined;
    }
    let pos = 0;
    const printing = !loaded;
    if (printing) setRevealed(0);
    else setRevealed(n);
    const id = setInterval(() => {
      pos += 1;
      if (printing) setRevealed(Math.min(pos, n));
      else setWavePos(pos <= n ? pos : null);
      if (pos > n) {
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

  const shared = { data, labels, ceiling, clipped, revealed: loaded && wavePos === null ? n : revealed, wavePos };

  return (
    <>
      <Matrix {...shared} cfg={MOBILE} className="block sm:hidden w-full flex-1 min-h-0 text-white overflow-visible" />
      <Matrix {...shared} cfg={DESKTOP} className="hidden sm:block w-full h-auto text-white overflow-visible" />
    </>
  );
}
