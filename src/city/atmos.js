import { hash3 } from './noise.js';
import { ATMOS_SLABS, MAX_T } from './render.js';
import { project, rayDir } from './scene.js';
import { WEATHER } from './env.js';

/*
 * City mode's atmosphere: the light-and-air layer over the pixel art
 * (HD-2D: crisp pixel-art structures, soft modern light and depth).
 *
 * It is a separate, smooth layer: computed on a grid of 2 x 2 city pixels,
 * drawn over the city canvas with smooth (bilinear) scaling and screen
 * blending, so it only ever adds light. It never moves, blurs, re-dithers or
 * otherwise touches a pixel of the art underneath, which stays exactly as
 * baked; mist drifts over the buildings, not through them.
 *
 * Depth comes from the geometry: for every cell the frame recorded how far
 * its ray runs through each air layer before it meets a surface, so mist lies
 * in the streets and between the towers but not over the roofs that rise
 * above it, and the distant haze thickens with distance.
 *
 *   mist     three layers, each anchored in the world and drifting with its own
 *            wind (and slowly churning): low in the streets, lit warm by the
 *            sodium light; between the towers, lit by the windows; and a thin,
 *            sparse veil just below the viewer, the nearest and fastest layer
 *   haze     the glow over the distant city, slowly breathing
 *   shafts   faint moonlight falling into the canyon through breaks in the
 *            cloud: vertical in the world (so they converge downward like the
 *            towers), seen only where there is air to light, opening and
 *            closing over a minute or two
 *   glints   soft light drifting over the bright wet reflections
 *   glow     soft halos round the warning lights, the neon sign and the cars
 *
 * The weather (env.js) changes the air: in rain the mist thickens and the
 * haze closes in, the moonlight shafts fade out, and water runs over the wet
 * streets in slow streaks; the glints follow how wet the surfaces are, so
 * they fade as the city dries. A storm's lightning lifts the sky and the
 * distant haze for a moment, brightest round where it struck; the moon
 * breaking through brightens the shafts and the sky a little. With the still
 * weather (STILL_ENV, also the default) the air is exactly the approved one.
 */

export const ATMOS = {
  cell: 2, // city pixels per atmosphere cell
  // per layer (ATMOS_SLABS order): density per metre, noise scale (m), wind (m/s), churn,
  // shaping thresholds, colour of the mist, how much the city's light below tints it, and the
  // most it may cover (so a long run through it near the horizon is a veil, not a wall)
  layers: [
    { k: 0.03, scale: 300, wind: [6, 2.2], churn: 0.35, lo: 0.4, hi: 0.68, color: [0.1, 0.11, 0.12], under: 2.0, max: 0.6, seed: 21 },
    { k: 0.014, scale: 380, wind: [8.5, -1.6], churn: 0.3, lo: 0.45, hi: 0.72, color: [0.085, 0.095, 0.115], under: 1.4, max: 0.5, seed: 22 },
    { k: 0.006, scale: 70, wind: [1.1, 0.35], churn: 0.4, lo: 0.52, hi: 0.9, color: [0.07, 0.08, 0.1], under: 0.25, max: 0.35, seed: 23 },
  ],
  haze: { color: [0.13, 0.13, 0.172], amp: 0.22, periodMs: 47000 }, // cool blue-grey, a little violet
  shafts: {
    color: [0.5, 0.58, 0.72],
    strength: 0.15,
    // around the downward vanishing point (radians): where, how wide, how fast it opens and closes
    beams: [
      { at: -0.2, width: 0.05, periodMs: 71000, phase: 0.1 },
      { at: 0.03, width: 0.035, periodMs: 53000, phase: 0.55 },
      { at: 0.24, width: 0.06, periodMs: 89000, phase: 0.8 },
    ],
    sway: 0.035, // how far a beam wanders as the cloud moves
    swayMs: 120000,
  },
  glints: { amp: 1.1, speed: 0.0011 },
  glow: { beacon: 0.3, beaconRadius: 3.2, sign: 0.55, signRadius: 2, car: 0.32, carRadius: 1.6 },
  max: 0.34, // no cell adds more light than this
};

// the weather the approved atmosphere was made for: clear, just after the rain
export const STILL_ENV = Object.freeze({ rain: 0, wet: WEATHER.wet.start, flash: 0, flashX: 0.5, moon: 0 });

export const WEATHER_AIR = {
  mist: 0.8, // mist density gains this much in the heaviest rain
  mistMax: 0.3, // and may cover this much more
  haze: 0.6, // the distant haze, likewise
  runoff: { amp: 0.5, speed: 0.0035 }, // water running over the wet streets
  flash: { color: [0.62, 0.68, 0.86], sky: 0.42, haze: 1.2, lift: 0.08, spread: 0.22, max: 0.3 },
  moon: { color: [0.55, 0.62, 0.8], sky: 0.05, haze: 0.06, shafts: 1.4 },
};

// the street and between-tower mist over the middle distance (surfaces beyond `from` metres): a ray
// that skims the city that far runs through kilometres of it, which would bury those towers in a fog
// bank; there it is thinned (the far haze still gives them their atmospheric perspective)
export const MIDDLE_MIST = { from: [2700, 3300], keep: 0.4 };

const NOISE = 128; // tileable noise texture, NOISE x NOISE
const FEATURE = 16; // texels per noise feature

function noiseTexture(seed) {
  const tex = new Float32Array(NOISE * NOISE);
  const fade = (t) => t * t * (3 - 2 * t);
  // two octaves of tileable value noise: hash the lattice once, then interpolate
  const octave = (cell, s, weight) => {
    const n = NOISE / cell;
    const lattice = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) lattice[j * n + i] = hash3(i, j, s);
    for (let y = 0; y < NOISE; y++) {
      const fy = y / cell;
      const j = Math.floor(fy);
      const v = fade(fy - j);
      const j0 = j % n;
      const j1 = (j + 1) % n;
      for (let x = 0; x < NOISE; x++) {
        const fx = x / cell;
        const i = Math.floor(fx);
        const u = fade(fx - i);
        const i0 = i % n;
        const i1 = (i + 1) % n;
        const a = lattice[j0 * n + i0];
        const b = lattice[j0 * n + i1];
        const c = lattice[j1 * n + i0];
        const d = lattice[j1 * n + i1];
        tex[y * NOISE + x] += (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * weight;
      }
    }
  };
  octave(FEATURE, seed, 2 / 3);
  octave(FEATURE / 2, seed + 1, 1 / 3);
  return tex;
}

/* Bilinear lookup in a tileable texture at texel coordinates (u, v). */
function sample(tex, u, v) {
  const fu = Math.floor(u);
  const fv = Math.floor(v);
  const x0 = fu & (NOISE - 1);
  const y0 = fv & (NOISE - 1);
  const x1 = (x0 + 1) & (NOISE - 1);
  const y1 = (y0 + 1) & (NOISE - 1);
  const tx = u - fu;
  const ty = v - fv;
  const a = tex[y0 * NOISE + x0];
  const b = tex[y0 * NOISE + x1];
  const c = tex[y1 * NOISE + x0];
  const d = tex[y1 * NOISE + x1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

const SKY_T = MAX_T - 1; // a ray that met nothing

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/*
 * frame: a createCityFrame(w, h, { capture: true }) after finish(). Keeps only
 * what it derives per cell; the frame can be released afterwards.
 */
export function createAtmosphere(frame, { seed = 1 } = {}) {
  const dyn = frame.dynamic;
  if (!dyn) throw new Error('createAtmosphere needs a frame rendered with { capture: true }');
  const { w, h } = frame;
  const cam = frame.camera;
  const cfg = ATMOS;
  const C = cfg.cell;
  const gw = Math.ceil(w / C);
  const gh = Math.ceil(h / C);
  const cells = gw * gh;
  const rows = dyn.ledgeTop; // the viewer's ledge (and below) stays clear: nothing is in front of it
  const L = ATMOS_SLABS.length;

  // per cell, averaged over its city pixels
  const run = ATMOS_SLABS.map(() => new Float32Array(cells)); // metres of each layer before the surface
  const tu = ATMOS_SLABS.map(() => new Float32Array(cells)); // noise coordinates where the ray crosses the layer
  const tv = ATMOS_SLABS.map(() => new Float32Array(cells));
  const haze = new Float32Array(cells);
  const under = new Float32Array(cells * 3); // the city's light around the cell, lighting the mist
  const glint = new Float32Array(cells * 3); // the wet reflection
  const air = new Float32Array(cells); // how much air there is to catch light (shafts)
  const depthSum = new Float32Array(cells); // how far off the cell's surfaces are (summed, then averaged)
  const angle = new Float32Array(cells); // angle round the downward vanishing point
  const signMap = new Float32Array(cells);
  const open = new Uint8Array(cells); // 0: the ledge
  const sky = new Float32Array(cells); // share of the cell that is open sky

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const c = gy * gw + gx;
      let n = 0;
      for (let dy = 0; dy < C; dy++) {
        for (let dx = 0; dx < C; dx++) {
          const x = gx * C + dx;
          const y = gy * C + dy;
          if (x >= w || y >= rows) continue;
          const p = y * w + x;
          n++;
          for (let l = 0; l < L; l++) run[l][c] += dyn.slabs[l][p];
          haze[c] += dyn.haze[p];
          depthSum[c] += dyn.depth[p];
          signMap[c] += dyn.sign[p];
          if (dyn.depth[p] >= SKY_T) sky[c] += 1;
          for (let k = 0; k < 3; k++) {
            under[c * 3 + k] += dyn.U[p * 3 + k];
            glint[c * 3 + k] += dyn.S[p * 3 + k];
          }
        }
      }
      if (!n) continue;
      open[c] = 1;
      for (let l = 0; l < L; l++) run[l][c] /= n;
      haze[c] /= n;
      // thinner mist over the middle distance (the two low layers)
      const thin = 1 - (1 - MIDDLE_MIST.keep) * smooth(MIDDLE_MIST.from[0], MIDDLE_MIST.from[1], depthSum[c] / n);
      run[0][c] *= thin;
      run[1][c] *= thin;
      signMap[c] /= n;
      sky[c] /= n;
      for (let k = 0; k < 3; k++) {
        under[c * 3 + k] /= n;
        glint[c * 3 + k] /= n;
      }
    }
  }

  // where each cell's ray crosses the middle of each layer, in noise texels (smooth across the screen)
  const dir = [0, 0, 0];
  const [ox, oy, oz] = cam.pos;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const c = gy * gw + gx;
      rayDir(cam, gx * C + C / 2, gy * C + C / 2, dir);
      for (let l = 0; l < L; l++) {
        const ym = (ATMOS_SLABS[l][0] + ATMOS_SLABS[l][1]) / 2;
        const t = dir[1] < -1e-4 ? (ym - oy) / dir[1] : 0;
        const s = FEATURE / cfg.layers[l].scale;
        tu[l][c] = (ox + dir[0] * t) * s;
        tv[l][c] = (oz + dir[2] * t) * s;
      }
      air[c] = Math.min(1, run[0][c] * 0.011 + run[1][c] * 0.007 + haze[c] * 0.9);
      if (dir[1] <= 0.005) sky[c] = 0; // only rays that rise and meet nothing are sky
    }
  }

  // the downward vanishing point: world verticals meet there, so the shafts (vertical) fan out from it
  const vp = project(cam, ox, oy - 1e5, oz + 1e-3) || { x: w / 2, y: h * 4 };
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const x = gx * C + C / 2;
      const y = gy * C + C / 2;
      angle[gy * gw + gx] = Math.atan2(x - vp.x, vp.y - y);
    }
  }

  // the neon sign's glow: its light spread over a few cells
  const signGlow = new Float32Array(cells);
  const R = cfg.glow.signRadius;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const s = signMap[gy * gw + gx];
      if (!s) continue;
      for (let y = -R; y <= R; y++) {
        for (let x = -R; x <= R; x++) {
          const qx = gx + x;
          const qy = gy + y;
          if (qx < 0 || qy < 0 || qx >= gw || qy >= gh) continue;
          const f = Math.max(0, 1 - Math.hypot(x, y) / (R + 1));
          signGlow[qy * gw + qx] += s * f * f;
        }
      }
    }
  }

  const tex = cfg.layers.map((layer) => noiseTexture(seed * 31 + layer.seed));
  const texB = cfg.layers.map((layer) => noiseTexture(seed * 37 + layer.seed + 100));
  const texH = noiseTexture(seed * 41 + 300);
  const texG = noiseTexture(seed * 43 + 400);

  const out = new Uint8ClampedArray(cells * 4);
  const acc = new Float32Array(cells * 3);
  for (let c = 0; c < cells; c++) out[c * 4 + 3] = 255; // opaque black adds nothing under screen blending

  /* Add a soft round light of colour (r, g, b) at city pixel (x, y). */
  function halo(x, y, radius, r, g, b) {
    const cx = x / C;
    const cy = y / C;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(gw - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(gh - 1, Math.ceil(cy + radius));
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const d = Math.hypot(gx + 0.5 - cx, gy + 0.5 - cy) / radius;
        if (d >= 1) continue;
        const f = (1 - d) * (1 - d);
        const k = (gy * gw + gx) * 3;
        acc[k] += r * f;
        acc[k + 1] += g * f;
        acc[k + 2] += b * f;
      }
    }
  }

  const lay = cfg.layers;
  const sh = cfg.shafts;
  // per-update state, allocated once
  const du = new Float64Array(L);
  const dv = new Float64Array(L);
  const cu = new Float64Array(L);
  const cv = new Float64Array(L);
  const beams = sh.beams.map((b) => ({ at: b.at, width: b.width, level: 0 }));

  return {
    w: gw,
    h: gh,
    cell: C,
    rgba: out,
    /*
     * The atmosphere at time t (ms). lights: [{ on, x, y, kind, level, r, g, b }] in city pixels,
     * the animation's moving lights (beacons by their level, cars by their colour); entries with
     * on false are skipped (the animation reuses them). env: the weather (env.js), STILL_ENV if left out.
     */
    update(t, lights = [], env = STILL_ENV) {
      const wa = WEATHER_AIR;
      const rain = env.rain;
      const mistGain = 1 + wa.mist * rain;
      const mistCap = 1 + wa.mistMax * rain;
      const hazeGain = 1 + wa.haze * rain;
      const clouded = (1 - rain) * (1 - rain);
      const shaftGain = clouded * (1 + wa.moon.shafts * env.moon);
      const wetGain = 0.3 + 0.7 * (env.wet / WEATHER.wet.start);
      const runoff = Math.min(rain, env.wet) * wa.runoff.amp;
      const flash = env.flash;
      const moonSky = env.moon * clouded * wa.moon.sky;
      // the layers' drift and churn (in texels), the beams' state
      for (let l = 0; l < L; l++) {
        const s = (FEATURE / lay[l].scale) * (t / 1000);
        du[l] = lay[l].wind[0] * s;
        dv[l] = lay[l].wind[1] * s;
        // the churn: a second pattern drifting across the first, slower and at an angle
        cu[l] = -lay[l].wind[1] * s * 0.6;
        cv[l] = lay[l].wind[0] * s * 0.45;
      }
      for (let i = 0; i < beams.length; i++) {
        const b = sh.beams[i];
        beams[i].at = b.at + sh.sway * Math.sin((t / sh.swayMs + i * 0.37) * Math.PI * 2);
        beams[i].level = Math.max(0, Math.sin((t / b.periodMs + b.phase) * Math.PI * 2)) ** 1.5;
      }
      const breath = 0.6 + 0.4 * Math.sin((t / cfg.haze.periodMs) * Math.PI * 2);
      const gl = t * cfg.glints.speed;
      const signLevel = 0.82 + 0.18 * Math.sin((t / 4300) * Math.PI * 2) * Math.sin((t / 1700) * Math.PI * 2);

      for (let c = 0; c < cells; c++) {
        const k = c * 3;
        if (!open[c]) {
          acc[k] = acc[k + 1] = acc[k + 2] = 0;
          continue;
        }
        let r = 0;
        let g = 0;
        let b = 0;
        const hz = haze[c];
        // mist
        for (let l = 0; l < L; l++) {
          const m = run[l][c];
          if (m < 0.5) continue;
          const ly = lay[l];
          const n = sample(tex[l], tu[l][c] + du[l], tv[l][c] + dv[l]) * (1 - ly.churn) + sample(texB[l], tu[l][c] + cu[l], tv[l][c] + cv[l]) * ly.churn;
          const d = smooth(ly.lo, ly.hi, n);
          if (d <= 0) continue;
          const tau = d * m * ly.k * mistGain;
          const a = Math.min(ly.max * mistCap, tau / (1 + tau));
          // far off, the light under the mist is the whole lit city: let it tint less
          const u = ly.under * (1 - 0.6 * hz);
          r += a * (ly.color[0] + under[k] * u);
          g += a * (ly.color[1] + under[k + 1] * u);
          b += a * (ly.color[2] + under[k + 2] * u);
        }
        // distant haze, breathing
        if (hz > 0.01) {
          const n = sample(texH, (c % gw) * 0.35 + t * 0.00006, ((c / gw) | 0) * 0.5);
          const f = hz * cfg.haze.amp * (0.45 + 0.55 * n) * breath * hazeGain;
          r += cfg.haze.color[0] * f;
          g += cfg.haze.color[1] * f;
          b += cfg.haze.color[2] * f;
        }
        // moonlight shafts in the air
        const a = air[c];
        if (a > 0.02) {
          let s = 0;
          for (let i = 0; i < beams.length; i++) {
            const x = (angle[c] - beams[i].at) / beams[i].width;
            if (x > -1 && x < 1) s += (1 - x * x) * (1 - x * x) * beams[i].level;
          }
          if (s > 0) {
            const f = s * a * sh.strength * shaftGain;
            r += sh.color[0] * f;
            g += sh.color[1] * f;
            b += sh.color[2] * f;
          }
        }
        // light drifting over the wet reflections
        const gr = glint[k] + glint[k + 1] + glint[k + 2];
        if (gr > 0.03) {
          const n = smooth(0.48, 0.82, sample(texG, (c % gw) * 0.9 + gl * 0.4, ((c / gw) | 0) * 2.2 - gl));
          let f = n * cfg.glints.amp * wetGain;
          // and, while it rains, water running down the streets in slow streaks
          if (runoff > 0.001) {
            const q = smooth(0.55, 0.85, sample(texG, (c % gw) * 3.1 + 40, ((c / gw) | 0) * 0.45 - t * wa.runoff.speed));
            f += q * runoff;
          }
          r += glint[k] * f;
          g += glint[k + 1] * f;
          b += glint[k + 2] * f;
        }
        // lightning: the sky and the distant haze light up, most round where it struck
        if (flash > 0.001) {
          const x = ((c % gw) + 0.5) / gw - env.flashX;
          const near = Math.exp(-(x * x) / (2 * wa.flash.spread * wa.flash.spread));
          const f = flash * (sky[c] * wa.flash.sky * (0.35 + 0.65 * near) + hz * wa.flash.haze * near + wa.flash.lift * a);
          r += wa.flash.color[0] * f;
          g += wa.flash.color[1] * f;
          b += wa.flash.color[2] * f;
        }
        // the moon through a break in the cloud: a little more light in the sky and on the distant haze
        if (moonSky > 0.0005 && (sky[c] > 0 || hz > 0.01)) {
          const f = moonSky * sky[c] + env.moon * clouded * wa.moon.haze * hz;
          r += wa.moon.color[0] * f;
          g += wa.moon.color[1] * f;
          b += wa.moon.color[2] * f;
        }
        // the neon sign's glow
        const sg = signGlow[c];
        if (sg > 0) {
          const f = sg * cfg.glow.sign * signLevel;
          r += 0.93 * f;
          g += 0.3 * f;
          b += 0.55 * f;
        }
        acc[k] = r;
        acc[k + 1] = g;
        acc[k + 2] = b;
      }
      // the moving lights' halos
      for (let i = 0; i < lights.length; i++) {
        const lt = lights[i];
        if (!lt.on) continue;
        const isBeacon = lt.kind === 'beacon';
        const f = (isBeacon ? cfg.glow.beacon : cfg.glow.car) * lt.level;
        if (f > 0.002) halo(lt.x, lt.y, isBeacon ? cfg.glow.beaconRadius : cfg.glow.carRadius, lt.r * f, lt.g * f, lt.b * f);
      }
      const max = cfg.max + wa.flash.max * flash;
      for (let c = 0; c < cells; c++) {
        const k = c * 3;
        const o = c * 4;
        out[o] = Math.min(max, acc[k]) * 255;
        out[o + 1] = Math.min(max, acc[k + 1]) * 255;
        out[o + 2] = Math.min(max, acc[k + 2]) * 255;
      }
      return out;
    },
  };
}
