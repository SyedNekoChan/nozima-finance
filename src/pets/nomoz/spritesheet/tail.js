/*
 * Run-time motion for the sprite-sheet cat: the tail and the tongue.
 *
 * The sheets hold still frames, so a tail baked into them would hang frozen.
 * Each frame lists its tail pixels (art/tails.json -> anchors.js `tail`: a
 * bounding box of '#' rows, the base where the tail leaves the body and its
 * tip). The renderer bends those pixels a little every redraw: the tail swings
 * about its base with a wave that travels down it (the tip lags), the root
 * stays put, so the art is never edited and the tail never breaks away from the
 * body. Pure functions here (no DOM), so they are tested on their own.
 */

/* ---- tail pixels ------------------------------------------------------- */

// Decodes an anchors.js tail entry once: { x, y, w, h, mask, base, tip, len, ux, uy, nx, ny }.
export function decodeTail(def) {
  if (!def || !Array.isArray(def.rows) || !def.rows.length) return null;
  const h = def.rows.length;
  const w = Math.max(...def.rows.map((r) => r.length));
  const mask = new Uint8Array(w * h);
  def.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') mask[y * w + x] = 1;
  });
  const [bx, by] = def.base;
  const [tx, ty] = def.tip;
  const len = Math.max(4, Math.hypot(tx - bx, ty - by));
  const ux = (tx - bx) / len;
  const uy = (ty - by) / len;
  return { x: def.x, y: def.y, w, h, mask, base: def.base, tip: def.tip, len, ux, uy, nx: -uy, ny: ux };
}

/*
 * How the tail moves for this state: { amp, period } (tip swing in px, ms per
 * swing). `p` is the render state (tail mode, pose, legs, eyes, mood...).
 */
export function tailTarget(p, clipSway = 1) {
  if (!clipSway) return { amp: 0, period: 3200 };
  const stressed = p.mood === 'stressed';
  const mode = stressed ? 'lash' : p.tail;
  const walking = p.legs === 1 || p.legs === 2 || p.legs === 3;
  const dozing = (p.eyes === 'closed' || p.eyes === 'blink') && p.droop;
  let amp = 1.5;
  let period = 3300;
  if (dozing) (amp = 0.9), (period = 5200);
  else if (walking) (amp = 2.2), (period = 1500);
  else if (p.pawL || p.pawR) (amp = 1.4), (period = 2700); // grooming
  if (mode === 'still') amp *= 0.25;
  else if (mode === 'swish') (amp = 3.8), (period = 950);
  else if (mode === 'lash') (amp = 4.2), (period = 560);
  else if (mode === 'up') (amp = Math.max(amp, 1.2)), (period = Math.min(period, 2600));
  return { amp: amp * clipSway, period };
}

/*
 * Advances the continuous motion state by dt ms: the swing eases toward its
 * target amplitude and rate, so a change of mode speeds up or settles the
 * tail instead of snapping it. state: { phase, amp, rate } (rate in rad / ms).
 */
export function stepTail(state, dt, target) {
  dt = Math.max(0, Math.min(dt, 250));
  const k = 1 - Math.exp(-dt / 450);
  const wantRate = (Math.PI * 2) / target.period;
  state.amp += (target.amp - state.amp) * k;
  state.rate += (wantRate - state.rate) * k;
  state.phase = (state.phase + state.rate * dt) % (Math.PI * 2);
  return state;
}

export const newTailState = () => ({ phase: Math.random() * Math.PI * 2, amp: 0, rate: (Math.PI * 2) / 3300 });

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Sideways displacement of a tail pixel at tail parameter s (0 at the root, 1 at the tip).
// The wave lags along the tail, but a big swing lags less: the displacement then changes by well under a pixel
// from one row of the tail to the next, so its outline moves in long runs instead of a one-pixel jog per row.
export function sway(s, amp, phase) {
  const lag = 1.5 * Math.min(1, 2.4 / Math.max(amp, 0.01));
  return amp * smooth(0.12, 1, s) * Math.sin(phase - lag * s);
}

/*
 * Bends the tail of a frame. rgba: the frame's pixels (w x h, RGBA, not
 * modified); returns a new array, or null when nothing moves. Vacated tail
 * pixels are cleared (or take the body colour round them when enclosed by it);
 * moved pixels never cover body pixels (the tail lies behind the body there).
 */
export function bendTail(rgba, w, h, tail, amp, phase) {
  if (!tail || amp < 0.08) return null;
  const out = new Uint8ClampedArray(rgba);
  const pad = Math.ceil(amp) + 1;
  const inMask = (x, y) => {
    const mx = x - tail.x;
    const my = y - tail.y;
    return mx >= 0 && my >= 0 && mx < tail.w && my < tail.h && tail.mask[my * tail.w + mx] === 1;
  };
  const x0 = Math.max(0, tail.x - pad);
  const y0 = Math.max(0, tail.y - pad);
  const x1 = Math.min(w, tail.x + tail.w + pad);
  const y1 = Math.min(h, tail.y + tail.h + pad);
  // clear the tail, then paint it back where it has moved to
  for (let y = tail.y; y < tail.y + tail.h; y++) {
    for (let x = tail.x; x < tail.x + tail.w; x++) if (inMask(x, y)) out[(y * w + x) * 4 + 3] = 0;
  }
  let moved = false;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const rx = x + 0.5 - tail.base[0];
      const ry = y + 0.5 - tail.base[1];
      const s = Math.min(1, Math.max(0, (rx * tail.ux + ry * tail.uy) / tail.len));
      const d = sway(s, amp, phase);
      const sx = Math.round(x - d * tail.nx);
      const sy = Math.round(y - d * tail.ny);
      if (!inMask(sx, sy)) continue;
      // never over a body pixel: opaque in the source and not part of the tail
      const o = (y * w + x) * 4;
      if (rgba[o + 3] > 0 && !inMask(x, y)) continue;
      const q = (sy * w + sx) * 4;
      out[o] = rgba[q];
      out[o + 1] = rgba[q + 1];
      out[o + 2] = rgba[q + 2];
      out[o + 3] = rgba[q + 3];
      if (x !== sx || y !== sy) moved = true;
    }
  }
  if (!moved) return null;
  smoothEdges(out, w, h, x0, y0, x1, y1);
  // a pixel the tail left that the body encloses takes the body's colour (no hole in the fur)
  for (let y = tail.y; y < tail.y + tail.h; y++) {
    for (let x = tail.x; x < tail.x + tail.w; x++) {
      const o = (y * w + x) * 4;
      if (!inMask(x, y) || out[o + 3] > 0) continue;
      let n = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h || inMask(xx, yy)) continue;
        const q = (yy * w + xx) * 4;
        if (out[q + 3] === 0) continue;
        n++;
        r += out[q];
        g += out[q + 1];
        b += out[q + 2];
      }
      if (n >= 3) {
        out[o] = r / n;
        out[o + 1] = g / n;
        out[o + 2] = b / n;
        out[o + 3] = 255;
      }
    }
  }
  return out;
}

/*
 * Cleans the stair-steps a large bend leaves along the outline, without blurring anything: a transparent pixel
 * with three opaque 4-neighbours (a notch) takes one neighbour's colour, and an opaque pixel with at most one
 * opaque 4-neighbour (a spur) is dropped. Colours are copied, never blended, so the palette stays exact.
 */
export function smoothEdges(px, w, h, x0, y0, x1, y1) {
  const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : px[(y * w + x) * 4 + 3]);
  const DIRS = [[-1, 0], [0, -1], [1, 0], [0, 1]];
  for (let pass = 0; pass < 2; pass++) {
    const fill = [];
    const drop = [];
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const o = A(x, y) > 0;
        const n = DIRS.reduce((c, [dx, dy]) => c + (A(x + dx, y + dy) > 0 ? 1 : 0), 0);
        if (!o && n >= 3) fill.push([x, y]);
        else if (o && n <= 1) drop.push([x, y]);
      }
    }
    for (const [x, y] of fill) {
      for (const [dx, dy] of DIRS) {
        if (A(x + dx, y + dy) > 0) {
          px.copyWithin((y * w + x) * 4, ((y + dy) * w + x + dx) * 4, ((y + dy) * w + x + dx) * 4 + 4);
          break;
        }
      }
    }
    for (const [x, y] of drop) px[(y * w + x) * 4 + 3] = 0;
  }
}

/* ---- the tongue ----------------------------------------------------------- */

const LICK_MS = 620; // one stroke: out, along the paw, back in, a beat of rest

/*
 * Where the grooming lick is at time `now` (ms): { tongue, dip }.
 * tongue 0 = in, 1 = the tip showing, 2 = out; dip 1 = the head is down into
 * the paw. Every fifth stroke is a pause, so it reads as washing, not a loop.
 */
export function lickAt(now) {
  const n = Math.floor(now / LICK_MS);
  const t = now - n * LICK_MS;
  // `paw`: 1 while the paw comes up to meet the tongue (the head goes down as the paw goes up); `wet`: the fur it licked shines
  if (n % 5 === 4) return { tongue: 0, dip: 0, paw: 0, wet: 0 };
  if (t < 90) return { tongue: 1, dip: 0, paw: 0, wet: 0 };
  if (t < 300) return { tongue: 2, dip: 1, paw: 1, wet: 0 };
  if (t < 390) return { tongue: 1, dip: 1, paw: 1, wet: 1 };
  if (t < 520) return { tongue: 0, dip: 0, paw: 1, wet: 1 };
  return { tongue: 0, dip: 0, paw: 0, wet: 0 };
}

// A lick the script asks for (mouth: 'lick'): out while it lasts. start: when it began.
export function mouthLick(now, start) {
  const t = now - start;
  if (t < 0 || t > 420) return { tongue: 0, dip: 0, paw: 0, wet: 0 };
  return { tongue: t < 70 || t > 330 ? 1 : 2, dip: 0, paw: 0, wet: 0 };
}

/*
 * A slow breath: 1 while the chest is up (the art above the cut drops a row),
 * 0 otherwise; about 45% of each period. The phase is time based, so it
 * carries on through redraws.
 */
export const breathAt = (now, ms) => ((now % ms) / ms < 0.45 ? 1 : 0);

// Cross-fade between two clips: how opaque the outgoing frame still is, 0..1.
export const FADE_MS = 120;
export const fadeLeft = (now, start) => Math.max(0, 1 - (now - start) / FADE_MS);
