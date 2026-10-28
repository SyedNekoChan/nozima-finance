/*
 * NOMOZ.EXE sprite-sheet production spec, as data. The human-readable
 * version is ./SPEC.md; ./validate.mjs checks the manifest and the PNGs
 * against this file. Derived from the implementation: views from
 * core/toolkit.js (VIEW_RING), poses from sprites.js (POSES, TURN_POSES),
 * gait timing from src/pets/config.js (SCHEDULER.stepMs, frameMs).
 */
export const FRAME = { width: 56, height: 60 }; // SPRITE_SIZE in ../config.js
export const VIEWS = ['front', 'frontQ', 'side', 'rearQ', 'rear']; // = sheet row order
/* Tight head-relative rectangles [x, y, w, h] kept procedural (front view); see SPEC.md. */
export const DYNAMIC = {
  front: { head: [[5, 10, 8, 8], [19, 10, 8, 8], [14, 20, 4, 2], [12, 22, 8, 4]] },
  side: { head: [[1, 10, 8, 8], [-3, 16, 9, 8]] },
};

export const SHEET_DIR = 'src/pets/nomoz/spritesheet/sheets';

/*
 * One sheet per group: columns = frames, rows = VIEWS (row i is VIEWS[i];
 * front-only groups have one row per pose). Clip ids are `<group>_<view>`
 * (or `<group>` for front-only poses), sheet ids and files `nomoz_<group>`.
 */
export const GROUPS = {
  idle: { pose: 'sit', moving: false, frames: 2, ms: 1000, loop: true, views: VIEWS },
  stand: { pose: 'stand', moving: false, frames: 2, ms: 1000, loop: true, views: VIEWS },
  walk: { pose: 'stand', moving: true, frames: 4, ms: 240, loop: true, views: VIEWS },
  creep: { pose: 'crouch', moving: true, frames: 4, ms: 240, loop: true, views: VIEWS },
  crouch: { pose: 'crouch', moving: false, frames: 2, ms: 1000, loop: true, views: VIEWS },
  leap: { pose: 'stand', legs: 3, frames: 1, ms: 1000, loop: true, views: VIEWS },
  stretch: { pose: 'stretch', frames: 2, ms: 1000, loop: true, views: ['front'] },
  low: { pose: 'low', frames: 2, ms: 1000, loop: true, views: ['front'] },
  loaf: { pose: 'loaf', frames: 2, ms: 1000, loop: true, views: ['front'] },
  curl: { pose: 'curl', frames: 2, ms: 1000, loop: true, views: ['front'] },
};

export const sheetId = (group) => `nomoz_${group}`;
export const clipId = (group, view) => (GROUPS[group].views.length > 1 ? `${group}_${view}` : group);

/* Every clip the full migration needs: id -> { group, view, row, frames }. */
export function requiredClips() {
  const out = {};
  for (const [group, g] of Object.entries(GROUPS)) {
    g.views.forEach((view) => {
      out[clipId(group, view)] = { group, view, row: VIEWS.indexOf(view), frames: g.frames, ms: g.ms };
    });
  }
  return out;
}

/* Expected PNG size of a group's sheet. */
export function sheetSize(group) {
  const g = GROUPS[group];
  const rows = g.views.length > 1 ? VIEWS.length : 1;
  return { width: FRAME.width * g.frames, height: FRAME.height * rows, columns: g.frames, rows };
}
