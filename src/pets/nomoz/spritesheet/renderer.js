import { LIGHTING } from '../config.js';
import { renderSprite, paletteColor } from '../sprites.js';
import { fitsImage, frameAt, frameRect, normalizeManifest, selectClip } from './clips.js';
import { getSheetImage } from './loader.js';

/*
 * The sprite-sheet render path, selected by SPRITE_RENDERER in ../config.js.
 *
 * It wraps the procedural renderer instead of replacing it. Every frame the
 * procedural renderer still runs in full (pupil easing and gaze, the head
 * anchor the vanity items use, lighting, stress / glitch passes, effects,
 * cues, items), and when a clip applies it is handed a "body" hook that
 * paints the sheet frame where the procedural fur would go, plus any
 * `dynamic` procedural regions the clip keeps on top. When no clip
 * applies, or anything about the clip fails, it simply draws procedurally.
 *
 * Playback: one small controller per canvas context (a WeakMap entry, no
 * shared timers). It owns the active clip and its start time, keeps it
 * running while unrelated state (a blink, a gaze, a leg phase) changes,
 * switches only when the selected clip changes (a one-shot marked `lock`
 * finishes first), follows `next` when a one-shot ends, and schedules its
 * own redraws for the next frame boundary. Redraws it triggers are flagged
 * `replay`, so the pupil eases once per state change as before.
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
  const bad = new Set(); // clip ids that failed once; drawn procedurally from then on

  const fail = (id, why) => {
    if (!bad.has(id)) console.warn(`[nomoz sheets] clip "${id}" disabled: ${why}`);
    bad.add(id);
  };

  function stateFor(ctx) {
    let c = states.get(ctx);
    if (!c) {
      c = { clip: null, target: undefined, shown: false, t0: 0, timer: 0, params: null, vanity: null, onReady: null };
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
  function silhouette(clip, index, image, rect, ox, oy, cw, ch) {
    const key = `${clip.id}:${index}:${cw}x${ch}`;
    let sil = silhouettes.get(key);
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
      silhouettes.set(key, sil);
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

  function makeBody(clip, sheet, image, index, cw, ch) {
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

    return {
      under: clip.under ? silhouette(clip, index, image, rect, ox, oy, cw, ch) : false,
      paint(ac, info) {
        try {
          ac.imageSmoothingEnabled = false;
          ac.drawImage(image, rect.x, rect.y, rect.w, rect.h, ox, oy, rect.w, rect.h);
          if (clip.under) rimLight(ac, silhouette(clip, index, image, rect, ox, oy, cw, ch), info.light);
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
          return false;
        }
      },
    };
  }

  function draw(ctx, c, replay) {
    clearTimeout(c.timer);
    c.timer = 0;

    const now = clock();
    const wanted = selectClip(man, c.params);
    const clip = settle(c, wanted && !bad.has(wanted.id) ? wanted : null, now);

    let body = null;
    let wait = Infinity;
    if (clip) {
      const sheet = man.sheets[clip.sheet];
      const entry = getSheetImage(sheet.src);
      if (entry.status === 'loading') {
        entry.listeners.add(c.onReady);
      } else if (entry.status === 'ready' && fitsImage(sheet, entry.image.naturalWidth, entry.image.naturalHeight)) {
        if (!c.shown) {
          c.shown = true;
          c.t0 = now;
        }
        const pos = prefersReducedMotion()
          ? { index: clip.still, wait: Infinity }
          : frameAt(clip, now - c.t0);
        body = makeBody(clip, sheet, entry.image, pos.index, ctx.canvas.width, ctx.canvas.height);
        wait = pos.wait;
      } else {
        fail(clip.id, entry.status === 'ready' ? 'the sheet is smaller than its frame grid' : 'the sheet failed to load');
      }
    }

    const params = replay ? { ...c.params, replay: true } : c.params;
    try {
      fallback(ctx, params, c.vanity, body);
    } catch (err) {
      if (!body) throw err;
      fail(clip.id, err.message);
      fallback(ctx, params, c.vanity, null);
      return;
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
      // never leave the pet frozen: the procedural cat draws this frame
      console.warn('[nomoz sheets] falling back to procedural drawing:', err);
      fallback(ctx, p, vanity);
    }
  };
}
