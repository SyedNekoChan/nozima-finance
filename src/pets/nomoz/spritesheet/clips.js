/*
 * Sprite-sheet data model: manifest validation, clip selection and frame
 * timing. Pure functions (no DOM, no timers) so they can be tested on
 * their own. Invalid entries are skipped with a warning; nothing here
 * throws for bad data, so a broken manifest only means "draw procedurally".
 */

const warn = (msg) => console.warn(`[nomoz sheets] ${msg}`);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isPos = (n) => Number.isInteger(n) && n > 0;
const isNat = (n) => Number.isInteger(n) && n >= 0;
const isPoint = (a) => Array.isArray(a) && a.length === 2 && a.every(Number.isFinite);
const isRect = (r) => Array.isArray(r) && r.length === 4 && r.every(Number.isInteger) && r[2] > 0 && r[3] > 0;

export const DEFAULT_FRAME_MS = 120;

function normalizeSheet(id, raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.src !== 'string' || !raw.src) {
    throw new Error('needs a src');
  }
  const { frameWidth, frameHeight, columns, rows } = raw;
  if (![frameWidth, frameHeight, columns, rows].every(isPos)) {
    throw new Error('needs positive integer frameWidth, frameHeight, columns and rows');
  }
  const margin = raw.margin ?? 0;
  const spacing = raw.spacing ?? 0;
  if (!isNat(margin) || !isNat(spacing)) throw new Error('margin and spacing must be whole numbers >= 0');
  return Object.freeze({ id, src: raw.src, frameWidth, frameHeight, columns, rows, margin, spacing });
}

function normalizeClip(id, raw, sheets) {
  if (!raw || typeof raw !== 'object') throw new Error('is not an object');
  const sheet = has(sheets, raw.sheet) ? sheets[raw.sheet] : null;
  if (!sheet) throw new Error(`uses unknown sheet "${raw.sheet}"`);
  const total = sheet.columns * sheet.rows;

  let frames;
  if (Array.isArray(raw.frames)) {
    frames = raw.frames.slice();
  } else if (isNat(raw.row)) {
    const start = raw.start ?? 0;
    const count = raw.count ?? sheet.columns - start;
    if (raw.row >= sheet.rows || !isNat(start) || !isPos(count) || start + count > sheet.columns) {
      throw new Error('row / start / count fall outside the sheet');
    }
    frames = Array.from({ length: count }, (_, i) => raw.row * sheet.columns + start + i);
  } else {
    throw new Error('needs frames or row');
  }
  if (!frames.length || !frames.every((f) => isNat(f) && f < total)) {
    throw new Error('has a frame outside the sheet');
  }

  let durations;
  if (Array.isArray(raw.ms)) {
    if (raw.ms.length !== frames.length || !raw.ms.every((m) => Number.isFinite(m) && m > 0)) {
      throw new Error('ms must list one positive duration per frame');
    }
    durations = raw.ms.slice();
  } else {
    const ms = raw.ms ?? DEFAULT_FRAME_MS;
    if (!Number.isFinite(ms) || ms <= 0) throw new Error('ms must be positive');
    durations = frames.map(() => ms);
  }

  for (const key of ['pivot', 'anchor']) {
    if (raw[key] !== undefined && !isPoint(raw[key])) throw new Error(`${key} must be [x, y]`);
  }
  const dyn = raw.dynamic || {};
  const head = dyn.head ?? [];
  const base = dyn.base ?? [];
  if (!Array.isArray(head) || !Array.isArray(base) || ![...head, ...base].every(isRect)) {
    throw new Error('dynamic rectangles must be [x, y, w, h] whole numbers');
  }

  // where the vanity items sit on this art (canvas coordinates): the crown's
  // and the chest coin's top-left, or null when hidden. One object for the
  // clip, or one per sheet frame used.
  const anchorList = raw.anchors === undefined ? null : Array.isArray(raw.anchors) ? raw.anchors : [raw.anchors];
  const okSpot = (v) => v === null || v === undefined || isPoint(v);
  if (anchorList && !anchorList.every((a) => a && okSpot(a.crown) && okSpot(a.chest))) {
    throw new Error('anchors need crown / chest as [x, y] or null');
  }
  if (anchorList && Array.isArray(raw.anchors) && raw.anchors.length !== frames.length) {
    throw new Error('anchors must list one entry per clip frame');
  }

  // the ground row for the floor shadow when the art is off the ground (a leap)
  if (raw.floor !== undefined && !isNat(raw.floor)) throw new Error('floor must be a row number');

  const still = raw.still ?? 0;
  if (!isNat(still) || still >= frames.length) throw new Error('still is outside the clip');

  return Object.freeze({
    id,
    sheet: raw.sheet,
    frames,
    durations,
    total: durations.reduce((a, b) => a + b, 0),
    loop: raw.loop !== false,
    next: typeof raw.next === 'string' ? raw.next : null,
    lock: raw.lock === true,
    still,
    pivot: raw.pivot || null,
    anchor: raw.anchor || null,
    under: raw.lighting !== 'baked',
    anchors: anchorList,
    floor: raw.floor ?? null,
    dynamic: Object.freeze({ head, base, whiskers: dyn.whiskers === true }),
  });
}

/* Validates a raw manifest into { sheets, clips, select }. Never throws. */
export function normalizeManifest(raw) {
  const out = { sheets: {}, clips: {}, select: [] };
  if (!raw || typeof raw !== 'object') return out;

  for (const [id, def] of Object.entries(raw.sheets || {})) {
    try {
      out.sheets[id] = normalizeSheet(id, def);
    } catch (err) {
      warn(`sheet "${id}" skipped: ${err.message}`);
    }
  }
  for (const [id, def] of Object.entries(raw.clips || {})) {
    try {
      out.clips[id] = normalizeClip(id, def, out.sheets);
    } catch (err) {
      warn(`clip "${id}" skipped: ${err.message}`);
    }
  }
  // a `next` that names no clip would crash the player; a one-shot just ends
  for (const [id, clip] of Object.entries(out.clips)) {
    if (clip.next !== null && !has(out.clips, clip.next)) {
      warn(`clip "${id}": next "${clip.next}" is not a clip; ignored`);
      out.clips[id] = Object.freeze({ ...clip, next: null });
    }
  }
  for (const [i, rule] of (Array.isArray(raw.select) ? raw.select : []).entries()) {
    if (rule && typeof rule.when === 'object' && rule.when && has(out.clips, rule.clip)) {
      out.select.push(Object.freeze({ when: rule.when, clip: rule.clip }));
    } else {
      warn(`select rule ${i} skipped: needs a "when" object and a known clip`);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

// The fields a rule may test: the render state plus `moving`.
export const factsOf = (p) => ({ ...p, moving: p.legs === 1 || p.legs === 2 || p.legs === 3 });

function matches(when, facts) {
  for (const [key, want] of Object.entries(when)) {
    const have = facts[key];
    if (Array.isArray(want)) {
      if (!want.includes(have)) return false;
    } else if (want === true) {
      if (!have) return false;
    } else if (want === false) {
      if (have) return false;
    } else if (have !== want) {
      return false;
    }
  }
  return true;
}

/* The clip the current render state calls for, or null (draw procedurally). */
export function selectClip(manifest, p) {
  const facts = factsOf(p);
  for (const rule of manifest.select) {
    if (matches(rule.when, facts)) return manifest.clips[rule.clip];
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Frames and timing                                                   */
/* ------------------------------------------------------------------ */

/* Source rectangle of frame `index` (row-major) inside its sheet image. */
export function frameRect(sheet, index) {
  const col = index % sheet.columns;
  const row = Math.floor(index / sheet.columns);
  return {
    x: sheet.margin + col * (sheet.frameWidth + sheet.spacing),
    y: sheet.margin + row * (sheet.frameHeight + sheet.spacing),
    w: sheet.frameWidth,
    h: sheet.frameHeight,
  };
}

/* True when every frame of the sheet lies inside an image of this size. */
export function fitsImage(sheet, width, height) {
  const w = sheet.margin + sheet.columns * sheet.frameWidth + (sheet.columns - 1) * sheet.spacing;
  const h = sheet.margin + sheet.rows * sheet.frameHeight + (sheet.rows - 1) * sheet.spacing;
  return width >= w && height >= h;
}

/*
 * Which frame (a position in clip.frames) shows `elapsed` ms into a clip,
 * whether a one-shot has finished, and how long until the frame changes
 * (Infinity when it never will).
 */
export function frameAt(clip, elapsed) {
  const last = clip.frames.length - 1;
  let t = Math.max(0, elapsed);
  if (clip.loop) {
    t %= clip.total;
  } else if (t >= clip.total) {
    return { index: last, done: true, wait: Infinity };
  }
  let end = 0;
  for (let i = 0; i <= last; i++) {
    end += clip.durations[i];
    if (t < end) {
      const still = clip.loop && last === 0;
      return { index: i, done: false, wait: still ? Infinity : end - t };
    }
  }
  return { index: last, done: false, wait: Infinity };
}
