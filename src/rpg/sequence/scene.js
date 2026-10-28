import { CAT, SORCERER, PALETTE } from './sprites.js';

/*
 * The opening scene: pure data for each step of the story plus a small
 * canvas painter. Logical size is 64x48 pixels; the host scales it by whole
 * numbers.
 */
export const SCENE_W = 64;
export const SCENE_H = 48;

export const STEPS = [
  { id: 'portal', ms: 1800, caption: 'A portal tears open.' },
  { id: 'sorcerer', ms: 1800, caption: 'An evil sorcerer steps through.' },
  { id: 'grab', ms: 1400, caption: 'He has his eyes on NOMOZ.EXE.' },
  { id: 'escape', ms: 1800, caption: 'The cat is taken!' },
  { id: 'gone', ms: 1200, caption: 'The portal closes. The cat is gone.' },
];

const PORTAL = { cx: 46, cy: 26, rx: 11, ry: 17 };
const FLOOR_Y = 44;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// Where everything is at progress p (0..1) of the given step.
export function sceneAt(stepId, p) {
  const t = clamp01(p);
  switch (stepId) {
    case 'portal':
      return { portal: t, cat: { x: 8, y: 30 }, sorc: null };
    case 'sorcerer':
      return { portal: 1, cat: { x: 8, y: 30 }, sorc: { x: lerp(40, 24, t), y: 30, alpha: clamp01(t * 4) } };
    case 'grab':
      return { portal: 1, cat: { x: 10, y: lerp(30, 26, t) }, sorc: { x: 24, y: 30, alpha: 1 } };
    case 'escape': {
      const x = lerp(24, 42, t);
      const alpha = t < 0.65 ? 1 : clamp01(1 - (t - 0.65) / 0.35);
      return { portal: 1, cat: { x: x - 14, y: 26, alpha }, sorc: { x, y: 30, alpha } };
    }
    case 'gone':
      return { portal: 1 - t, cat: null, sorc: null };
    case 'entered':
      return { portal: 1, cat: null, sorc: null };
    default:
      return { portal: 0, cat: null, sorc: null };
  }
}

const spriteCache = new Map();
function spriteCanvas(name, rows) {
  if (!spriteCache.has(name)) {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const ctx = c.getContext('2d');
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === '.') return;
        ctx.fillStyle = PALETTE[ch];
        ctx.fillRect(x, y, 1, 1);
      });
    });
    spriteCache.set(name, c);
  }
  return spriteCache.get(name);
}

const BANDS = ['#1a0b3a', '#5b2fb0', '#a96bff', '#e0c6ff'];

function drawPortal(ctx, open, frame) {
  if (open <= 0.02) return;
  const rx = PORTAL.rx * open;
  const ry = PORTAL.ry * open;
  for (let y = Math.floor(PORTAL.cy - ry); y <= Math.ceil(PORTAL.cy + ry); y++) {
    for (let x = Math.floor(PORTAL.cx - rx); x <= Math.ceil(PORTAL.cx + rx); x++) {
      const d = ((x + 0.5 - PORTAL.cx) / rx) ** 2 + ((y + 0.5 - PORTAL.cy) / ry) ** 2;
      if (d > 1) continue;
      const ring = Math.min(3, Math.floor(d * 4));
      ctx.fillStyle = BANDS[(ring + (d > 0.15 ? frame : 0)) % 4];
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function drawActor(ctx, name, rows, a) {
  if (!a) return;
  ctx.globalAlpha = a.alpha ?? 1;
  ctx.drawImage(spriteCanvas(name, rows), Math.round(a.x), Math.round(a.y));
  ctx.globalAlpha = 1;
}

export function drawScene(ctx, scene, frame = 0) {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, SCENE_W, SCENE_H);
  ctx.fillStyle = '#0f0d1a';
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  ctx.fillStyle = '#1b1833';
  ctx.fillRect(0, FLOOR_Y, SCENE_W, SCENE_H - FLOOR_Y);
  ctx.fillStyle = '#2a2650';
  for (let x = 2; x < SCENE_W; x += 8) ctx.fillRect(x, FLOOR_Y + 2, 2, 1);
  drawPortal(ctx, scene.portal, frame);
  drawActor(ctx, 'sorcerer', SORCERER, scene.sorc);
  drawActor(ctx, 'cat', CAT, scene.cat);
}
