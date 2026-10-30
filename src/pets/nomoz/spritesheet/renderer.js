import { LIGHTING } from '../config.js';
import { renderSprite, paletteColor } from '../sprites.js';
import { fitsImage, frameAt, frameRect, normalizeManifest, selectClip } from './clips.js';
import { getSheetImage } from './loader.js';
import { bendTail, breathAt, decodeTail, lickAt, mouthLick, newTailState, stepTail, tailTarget } from './tail.js';

/*
 * The sprite-sheet render path, selected by SPRITE_RENDERER in ../config.js.
 *
 * It wraps the procedural renderer instead of replacing it. Every frame the
 * procedural renderer still runs in full (pupil easing and gaze, the head
 * anchor the vanity items use, lighting, stress / glitch passes, effects,
 * cues, items), and it is always handed a "body" hook that paints a sheet
 * frame where the procedural fur would go, plus any `dynamic` procedural
 * regions the clip keeps on top. The procedural CAT itself is never drawn
 * while this renderer is active, not even for one frame: when the wanted
 * clip cannot be shown (its sheet is still loading or failed, no rule
 * matches, a paint failed) the frame on screen is held, else the default
 * sitting frame is used, else nothing is drawn until a sheet is ready.
 *
 * Playback: one small controller per canvas context (a WeakMap entry, no
 * shared timers). It owns the active clip and its start time, keeps it
 * running while unrelated state (a blink, a gaze, a leg phase) changes,
 * switches only when the selected clip changes (a one-shot marked `lock`
 * finishes first), follows `next` when a one-shot ends, and schedules its
 * own redraws for the next frame boundary. Redraws it triggers are flagged
 * `replay`, so the pupil eases once per state change as before.
 *
 * Motion on top of the still frames (./tail.js): the tail pixels listed for a
 * frame are bent a little every ~100 ms, with a continuous phase and an
 * amplitude that eases between states (idle, grooming, dozing, walking, swish,
 * lash), so the tail never hangs frozen and never snaps; a grooming clip draws
 * a tongue that strokes the paw while the head dips into it, and a scripted
 * `mouth: 'lick'` shows the tongue at the muzzle.
 */

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function prefersReducedMotion() {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function createSheetRenderer({ manifest, fallback = renderSprite } = {}) {
  const man = normalizeManifest(manifest);
  // nothing usable registered: the procedural renderer, unchanged
  if (!man.select.length) return fallback;

  const states = new WeakMap();
  const bad = new Set(); // clip ids that failed once; their frames are replaced by the held / default sheet frame from then on

  // Every sheet is small (about 70 KB in all): start loading all of them now, so a clip's sheet is nearly always ready
  // the first time it is wanted.
  for (const sheet of Object.values(man.sheets)) getSheetImage(sheet.src);

  const fail = (id, why) => {
    if (!bad.has(id)) console.warn(`[nomoz sheets] clip "${id}" disabled: ${why}`);
    bad.add(id);
  };

  function stateFor(ctx) {
    let c = states.get(ctx);
    if (!c) {
      c = { clip: null, target: undefined, shown: false, t0: 0, timer: 0, params: null, vanity: null, onReady: null, tail: newTailState(), tickAt: 0, lickAt: -1e9, wasLick: false, scratch: null, last: null };
      c.onReady = () => redraw(ctx, c);
      states.set(ctx, c);
    }
    return c;
  }

  const begin = (c, clip, now) => {
    c.clip = clip;
    c.t0 = now;
    c.shown = false; // the clock starts when its first frame is on screen
    return clip;
  };

  // Keeps, finishes or replaces the active clip for the selected one.
  function settle(c, wanted, now) {
    const tid = wanted ? wanted.id : null;
    const cur = c.clip;
    if (cur) {
      const finished = c.shown && !cur.loop && now - c.t0 >= cur.total;
      const nxt = finished && cur.next && !bad.has(cur.next) ? man.clips[cur.next] : null;
      if (nxt) {
        c.target = tid;
        return begin(c, nxt, now);
      }
      if (!finished && cur.lock && !cur.loop) return cur; // let it finish
    }
    if (tid === c.target) return cur;
    c.target = tid;
    return begin(c, wanted, now);
  }

  // Silhouette of a frame in canvas coordinates, for the floor pool and aura.
  const silhouettes = new Map();
  // `source` is the sheet (rect = the frame in it) or, for a bent tail, a canvas holding just the frame (rect at 0, 0);
  // a bent frame is not cached
  function silhouette(clip, index, image, rect, ox, oy, cw, ch, bent = false) {
    const key = bent ? null : `${clip.id}:${index}:${cw}x${ch}`;
    let sil = key && silhouettes.get(key);
    if (!sil) {
      const cv = document.createElement('canvas');
      cv.width = cw;
      cv.height = ch;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(image, rect.x, rect.y, rect.w, rect.h, ox, oy, rect.w, rect.h);
      const px = g.getImageData(0, 0, cw, ch).data;
      const mask = Array.from({ length: ch }, (_, y) =>
        Array.from({ length: cw }, (_, x) => (px[(y * cw + x) * 4 + 3] > 0 ? 'x' : '.'))
      );
      let bottom = -1;
      for (let y = ch - 1; y >= 0 && bottom < 0; y--) if (mask[y].includes('x')) bottom = y;
      let x0 = cw;
      let x1 = -1;
      for (let y = Math.max(0, bottom - 1); y <= bottom; y++) {
        mask[y].forEach((v, x) => {
          if (v === 'x') {
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
          }
        });
      }
      sil = { mask, px, footY: clip.floor ?? Math.max(2, Math.min(ch - 2, bottom)), feet: [x0 + 2, Math.max(x0 + 2, x1 - 2)], poolX: cw / 2 - 0.5 };
      if (key) silhouettes.set(key, sil);
    }
    return sil;
  }

  // The cat is near-black, so (like the procedural cat) it is revealed by a
  // rim light on its upper-left edges and a dim one on the right, from the
  // silhouette of the frame; the depth sets the strength (LIGHTING.rim).
  function rimLight(ac, sil, light) {
    const [tl, corner, right] = LIGHTING.rim[Math.max(0, Math.min(2, light ?? 1))].map(paletteColor);
    const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const cw = sil.mask[0].length;
    const lum = (r, g, b) => r + g + b;
    const colours = [tl, corner, right].map((c) => ({ c, v: hex(c) }));
    sil.mask.forEach((row, y) => {
      row.forEach((m, x) => {
        if (m !== 'x') return;
        const up = y === 0 || sil.mask[y - 1][x] !== 'x';
        const left = x === 0 || row[x - 1] !== 'x';
        const r = x === cw - 1 || row[x + 1] !== 'x';
        const pick = up && left ? colours[1] : up || left ? colours[0] : r ? colours[2] : null;
        if (!pick) return;
        const o = (y * cw + x) * 4;
        if (lum(...pick.v) <= lum(sil.px[o], sil.px[o + 1], sil.px[o + 2])) return;
        ac.fillStyle = pick.c;
        ac.fillRect(x, y, 1, 1);
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* The face: eyes and whiskers drawn live over the art                 */
  /* ---------------------------------------------------------------- */

  // the yellows of the approved eyes, a near-black pupil and a lid
  const EYE = { L: '#e4cb84', M: '#d9bf80', D: '#cab178', d: '#ab9464', P: '#09080b', lid: '#18171b', pale: '#dfe6ea' };

  // eye shape rows for a w x 3 box; null keeps what is under it, chars index EYE
  function eyeRows(w, kind, pupil, shift) {
    const c = w >> 1;
    const inner = (i) => i >= 1 && i <= w - 2;
    const row = (fn) => Array.from({ length: w }, (_, i) => fn(i));
    if (kind === 'closed') return [row(() => null), row(() => 'P'), row(() => null)];
    if (kind === 'happy') {
      return [row((i) => (inner(i) ? 'P' : null)), row((i) => (inner(i) ? null : 'P')), row(() => null)];
    }
    const iris = kind === 'panic' ? 'pale' : kind === 'wide' ? 'L' : null;
    const col = (r, i) => iris || (r === 1 ? (i === c ? 'L' : 'M') : 'D');
    const p0 = Math.max(1, Math.min(w - 2, c + shift));
    const wide = pupil >= 3 && w >= 5 ? [p0 - 1, p0, p0 + 1] : pupil === 2 && w >= 4 ? [p0, Math.min(w - 2, p0 + 1)] : [p0];
    const rows = [0, 1, 2].map((r) =>
      row((i) => {
        if (r !== 1 && !inner(i)) return null;
        if (wide.includes(i) && !(r !== 1 && wide.length > 2 && i !== p0)) return 'P';
        return col(r, i);
      })
    );
    if (kind === 'down') return [row(() => 'lid'), row((i) => (inner(i) ? 'lid' : null)), rows[2]];
    if (kind === 'wide') rows.unshift(row((i) => (inner(i) ? 'D' : null)));
    return rows;
  }

  function drawEyes(ac, eyes, face, ox) {
    if (!eyes || !face) return;
    const dxGaze = face.gaze === 'l' ? -1 : face.gaze === 'r' ? 1 : 0;
    for (const [x, y, w] of eyes) {
      // cover the painted eye with fur taken from just above / below it
      const x0 = Math.max(0, x - 1);
      const span = w + 2;
      const above = ac.getImageData(x0, y - 3, span, 1).data;
      const below = ac.getImageData(x0, y + 4, span, 1).data;
      for (let r = -2; r <= 3; r++) {
        const src = r <= 1 ? above : below;
        for (let i = 0; i < span; i++) {
          if (src[i * 4 + 3] === 0) continue;
          // fur only: a highlight above or below the eye is not copied into it
          const bright = src[i * 4] + src[i * 4 + 1] + src[i * 4 + 2] > 190;
          ac.fillStyle = bright ? '#252427' : `rgb(${src[i * 4]},${src[i * 4 + 1]},${src[i * 4 + 2]})`;
          ac.fillRect(x0 + i, y + r, 1, 1);
        }
      }
      let shift = dxGaze;
      if (face.focusX != null) {
        const t = Math.max(-1, Math.min(1, Math.round((face.focusX + ox - (x + w / 2)) / 10)));
        if (!(dxGaze && t && t !== dxGaze)) shift = t;
      }
      const kind = face.kind === 'blink' ? 'closed' : face.kind;
      const rows = eyeRows(w, kind, face.pupil ?? 1, shift);
      const top = rows.length === 4 ? y - 1 : y;
      rows.forEach((row, r) =>
        row.forEach((k, i) => {
          if (!k) return;
          ac.fillStyle = EYE[k];
          ac.fillRect(x + i, top + r, 1, 1);
        })
      );
    }
  }

  // three fine whiskers a side: the upper lifts, the middle runs level, the
  // lower droops; the last two pixels fade
  function drawWhiskers(ac, whiskers) {
    if (!whiskers) return;
    const seen = { '-1': 0, 1: 0 };
    for (const [x, y, dir, len] of whiskers) {
      const n = seen[dir]++ % 3;
      for (let i = 0; i < len; i++) {
        const dy = n === 0 ? -Math.floor((i + 1) / 3) : n === 2 ? Math.floor((i + 1) / 3) : 0;
        ac.fillStyle = paletteColor(i >= len - 2 ? '4' : '5');
        ac.fillRect(x + dir * (i + 1), y + dy, 1, 1);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Tail and tongue                                                     */
  /* ---------------------------------------------------------------- */

  // the pixels of a sheet frame and its decoded tail, read once per frame
  const framePixels = new Map();
  function pixelsOf(clip, sheet, image, index, rect, an) {
    const key = `${sheet.src}:${clip.frames[index]}`;
    let f = framePixels.get(key);
    if (!f) {
      const cv = document.createElement('canvas');
      cv.width = rect.w;
      cv.height = rect.h;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(image, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
      f = { data: g.getImageData(0, 0, rect.w, rect.h).data, tail: decodeTail(an && an.tail) };
      framePixels.set(key, f);
    }
    return f;
  }

  // a small pink tongue: level 1 = the tip, 2 = out; (x, y) is its top-left
  const TONGUE = { tip: '#ff9db8', body: '#e0708c', edge: '#8a3550', line: '#2a1119' };
  // rows of the tongue at full length: t tip, b body, e edge (its shaded underside)
  const TONGUE_OUT = ['.tt.', 'bttb', 'bttb', '.be.', '..e.'];
  const TONGUE_TIP = ['.tt.', 'bttb'];
  const TONGUE_SHORT = ['.tt.', 'bttb', '.be.']; // at the mouth: short enough to clear the worn coin
  function drawTongue(ac, at, level, long) {
    if (!at || !level) return;
    const [x, y] = at;
    const rows = level === 1 ? TONGUE_TIP : long ? TONGUE_OUT : TONGUE_SHORT;
    const has = (dx, dy) => dy >= 0 && dy < rows.length && dx >= 0 && dx < rows[dy].length && rows[dy][dx] !== '.';
    // a dark one-pixel line round it, so the pink reads against both dark fur and the lit paw (it matters at phone size)
    ac.fillStyle = TONGUE.line;
    for (let dy = -1; dy <= rows.length; dy++) {
      for (let dx = -1; dx <= 4; dx++) {
        if (!has(dx, dy) && (has(dx - 1, dy) || has(dx + 1, dy) || has(dx, dy - 1) || has(dx, dy + 1))) ac.fillRect(x + dx, y + dy, 1, 1);
      }
    }
    rows.forEach((row, dy) =>
      [...row].forEach((k, dx) => {
        if (k === '.') return;
        ac.fillStyle = k === 't' ? TONGUE.tip : k === 'b' ? TONGUE.body : TONGUE.edge;
        ac.fillRect(x + dx, y + dy, 1, 1);
      })
    );
  }

  function makeBody(clip, sheet, image, index, cw, ch, fx) {
    const rect = frameRect(sheet, clip.frames[index]);
    const [px, py] = clip.pivot || [sheet.frameWidth / 2, sheet.frameHeight];
    const [ax, ay] = clip.anchor || [cw / 2, ch];
    const ox = Math.round(ax - px);
    const oy = Math.round(ay - py);
    const { head, base, whiskers } = clip.dynamic;
    const an = clip.anchors && (clip.anchors[index] || clip.anchors[0]);
    // the crown slot is (hx + 12, hy + 3) and the chest slot is the chest point
    const anchor = an
      ? {
          hx: an.crown ? an.crown[0] - 12 : -100,
          hy: an.crown ? an.crown[1] - 3 : -100,
          chest: an.chest ? { x: an.chest[0], y: an.chest[1] } : null,
          chestTurn: an.chestTurn || 0,
        }
      : null;

    // the frame with its tail bent, on a canvas of its own (null: the still frame)
    let bent = null;
    if (fx && fx.amp > 0 && an && an.tail) {
      const f = pixelsOf(clip, sheet, image, index, rect, an);
      const out = f.tail && bendTail(f.data, rect.w, rect.h, f.tail, fx.amp, fx.phase);
      if (out) {
        const cv = fx.holder.scratch || (fx.holder.scratch = document.createElement('canvas'));
        if (cv.width !== rect.w || cv.height !== rect.h) {
          cv.width = rect.w;
          cv.height = rect.h;
        }
        cv.getContext('2d').putImageData(new ImageData(out, rect.w, rect.h), 0, 0);
        bent = cv;
      }
    }
    const src = bent || image;
    const sx = bent ? 0 : rect.x;
    const sy = bent ? 0 : rect.y;
    const sil = () => silhouette(clip, index, src, { ...rect, x: sx, y: sy }, ox, oy, cw, ch, !!bent);

    if (fx && fx.record) fx.record({ clip, sheet, image, index, rect, ox, oy });
    const body = {
      under: clip.under ? sil() : false,
      noProcedural: true, // if this body cannot paint, the procedural cat is still not drawn: draw() holds a sheet frame instead
      failed: false,
      paint(ac, info) {
        try {
          ac.imageSmoothingEnabled = false;
          // the head and shoulders dip a row into each lick (grooming) or with each breath (sitting)
          const lickDip = fx && fx.lick && clip.lick ? fx.lick.dip : 0;
          const breath = !lickDip && fx && fx.breath && clip.breathe ? 1 : 0;
          const dip = lickDip || breath;
          const cut = lickDip ? clip.lick.dip : breath ? clip.breathe.cut : 0;
          if (dip && cut > 0) {
            ac.drawImage(src, sx, sy + cut - 1, rect.w, rect.h - cut + 1, ox, oy + cut - 1, rect.w, rect.h - cut + 1);
            ac.drawImage(src, sx, sy, rect.w, cut, ox, oy + dip, rect.w, cut);
          } else {
            ac.drawImage(src, sx, sy, rect.w, rect.h, ox, oy, rect.w, rect.h);
          }
          if (fx && fx.lick && clip.lick) {
            const L = clip.lick;
            // the paw comes up to meet the tongue while the head goes down
            if (fx.lick.paw && L.paw) {
              const [px_, py_, pw_, ph_] = L.paw;
              ac.drawImage(src, sx + px_, sy + py_, pw_, ph_, ox + px_, oy + py_ - 1, pw_, ph_);
            }
            // the licked fur shines for a moment
            if (fx.lick.wet) {
              ac.fillStyle = '#25242a';
              for (const [wx, wy] of L.sheen) ac.fillRect(ox + wx, oy + wy - (fx.lick.paw ? 1 : 0), 1, 1);
            }
          }
          if (clip.under) rimLight(ac, sil(), info.light);
          drawEyes(ac, an && an.eyes, info.face, info.ox);
          drawWhiskers(ac, an && an.whiskers);
          if (fx && fx.lick) {
            const spot = clip.lick ? [clip.lick.at[0] + ox, clip.lick.at[1] + oy + dip] : an && an.mouth ? [an.mouth[0] - 1 + ox, an.mouth[1] + oy] : null;
            drawTongue(ac, spot, fx.lick.tongue, !!clip.lick);
          }
          // kept procedural regions: rectangles are in procedural space
          const keep = [...base, ...head.map(([x, y, w, h]) => [info.hx + x, info.hy + y, w, h])];
          for (const [x, y, w, h] of keep) {
            ac.clearRect(x + info.ox, y + info.oy, w, h);
            for (let yy = Math.max(0, y); yy < Math.min(info.grid.length, y + h); yy++) {
              for (let xx = Math.max(0, x); xx < Math.min(info.grid[0].length, x + w); xx++) {
                const c = info.grid[yy][xx];
                if (c === '.') continue;
                ac.fillStyle = paletteColor(c);
                ac.fillRect(xx + info.ox, yy + info.oy, 1, 1);
              }
            }
          }
          return { over: whiskers, anchor };
        } catch (err) {
          fail(clip.id, err.message);
          body.failed = true;
          return false;
        }
      },
    };
    return body;
  }

  // The tail's bend and the tongue for this redraw: { amp, phase, lick, holder, animating }.
  function motionFor(c, clip, params, now, reduced) {
    const dt = c.tickAt ? now - c.tickAt : 0;
    c.tickAt = now;
    const fx = { amp: 0, phase: 0, lick: null, holder: c, animating: false, breath: 0, wait: Infinity, record: null };
    if (reduced) return fx;
    if (clip.breathe) {
      const { ms } = clip.breathe;
      fx.breath = breathAt(now, ms);
      const t = now % ms;
      fx.wait = Math.min(fx.wait, Math.max(16, Math.ceil((fx.breath ? 0.45 * ms : ms) - t)));
    }
    const target = tailTarget(params || {}, clip.sway, clip.loop && clip.frames.length > 2 ? clip.total : 0);
    stepTail(c.tail, dt, target);
    fx.amp = c.tail.amp;
    fx.phase = c.tail.phase;
    // it keeps coming back while the tail should swing (also from rest: the swing eases in over the redraws)
    const hasTail = !!(clip.anchors && clip.anchors.some((a) => a && a.tail));
    fx.animating = hasTail && (target.amp > 0.08 || c.tail.amp > 0.08);
    // grooming: licking while a paw is at the mouth; any clip: a scripted lick
    const paw = params && (params.pawL === 'high' || params.pawR === 'high');
    if (clip.lick && paw) {
      fx.lick = lickAt(now);
      fx.animating = true;
    } else if (params && params.mouth === 'lick') {
      if (!c.wasLick) c.lickAt = now;
      fx.lick = mouthLick(now, c.lickAt);
      fx.animating = true;
    }
    c.wasLick = !!(params && params.mouth === 'lick');
    return fx;
  }

  /*
   * The body for `clip` at time `now`: { body, wait }, or null when it cannot be shown right now: its sheet is still
   * loading (a redraw is queued for when it settles), failed, or is smaller than its frame grid.
   */
  function bodyFor(ctx, c, clip, now) {
    const sheet = man.sheets[clip.sheet];
    const entry = getSheetImage(sheet.src);
    if (entry.status === 'loading') {
      entry.listeners.add(c.onReady);
      return null;
    }
    if (entry.status !== 'ready' || !fitsImage(sheet, entry.image.naturalWidth, entry.image.naturalHeight)) {
      fail(clip.id, entry.status === 'ready' ? 'the sheet is smaller than its frame grid' : 'the sheet failed to load');
      return null;
    }
    if (!c.shown) {
      c.shown = true;
      c.t0 = now;
    }
    const reduced = prefersReducedMotion();
    const pos = reduced ? { index: clip.still, wait: Infinity } : frameAt(clip, now - c.t0);
    const fx = motionFor(c, clip, c.params, now, reduced);
    fx.record = (f) => {
      c.last = { ...f, at: now };
    };
    const body = makeBody(clip, sheet, entry.image, pos.index, ctx.canvas.width, ctx.canvas.height, fx);
    const hidden = typeof document !== 'undefined' && document.hidden;
    let wait = hidden ? pos.wait : Math.min(pos.wait, fx.wait);
    // the tail and the tongue move between frames: come back soon (not at all when the tab is hidden)
    if (fx.animating && !hidden) wait = Math.min(wait, fx.lick ? 60 : 100);
    return { body, wait };
  }

  /*
   * A sheet frame to show when the wanted one cannot be drawn: the frame that is already on screen (so a pose waits for
   * its sheet without a flicker), else the default sitting frame, else null (nothing is drawn). Never the procedural cat.
   */
  function holdBody(ctx, c) {
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    const still = { amp: 0, phase: 0, lick: null, holder: c, animating: false, breath: 0, wait: Infinity, record: null };
    const last = c.last;
    if (last && !bad.has(last.clip.id)) return makeBody(last.clip, last.sheet, last.image, last.index, cw, ch, still);
    // the default: the clip of the last (most general) rule, else any rule's clip whose sheet is ready
    for (const rule of [...man.select].reverse()) {
      const clip = man.clips[rule.clip];
      if (!clip || bad.has(clip.id)) continue;
      const sheet = man.sheets[clip.sheet];
      const entry = getSheetImage(sheet.src);
      if (entry.status === 'ready' && fitsImage(sheet, entry.image.naturalWidth, entry.image.naturalHeight)) {
        return makeBody(clip, sheet, entry.image, clip.still, cw, ch, still);
      }
    }
    return null;
  }

  function draw(ctx, c, replay) {
    clearTimeout(c.timer);
    c.timer = 0;

    const now = clock();
    const wanted = selectClip(man, c.params);
    const clip = settle(c, wanted && !bad.has(wanted.id) ? wanted : null, now);

    let shown = clip ? bodyFor(ctx, c, clip, now) : null;
    let body = shown && shown.body;
    let wait = shown ? shown.wait : Infinity;
    const params = replay ? { ...c.params, replay: true } : c.params;

    const paint = (b) => {
      try {
        fallback(ctx, params, c.vanity, b);
      } catch (err) {
        if (!b) throw err;
        fail(b.clipId || (clip && clip.id) || 'body', err.message);
        b.failed = true;
      }
      return !b.failed;
    };

    if (!body || !paint(body)) {
      // the wanted frame is not available (loading, failed, no rule, or its paint failed): hold a sheet frame instead
      body = holdBody(ctx, c);
      wait = Infinity;
      if (!body) {
        // nothing of the sheet cat can be drawn yet: draw nothing (never the procedural cat); a queued redraw follows the load
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        return;
      }
      if (!paint(body)) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        return;
      }
    }

    if (body && wait < Infinity && ctx.canvas?.isConnected !== false) {
      c.timer = setTimeout(() => redraw(ctx, c), Math.max(16, Math.ceil(wait)));
    }
  }

  // A timer- or load-driven redraw of the last state.
  function redraw(ctx, c) {
    c.timer = 0;
    if (!c.params || ctx.canvas?.isConnected === false) return;
    try {
      draw(ctx, c, true);
    } catch (err) {
      console.warn('[nomoz sheets] redraw stopped:', err);
    }
  }

  return function renderSheetSprite(ctx, p, vanity) {
    const c = stateFor(ctx);
    c.params = p;
    c.vanity = vanity;
    try {
      draw(ctx, c, false);
    } catch (err) {
      // the frame on screen stays (the procedural cat is never drawn in its place)
      console.warn('[nomoz sheets] drawing stopped for this frame:', err);
    }
  };
}
