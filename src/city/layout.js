/*
 * How the city's low-resolution scene maps onto the screen.
 *
 * One city pixel is a whole number of DEVICE pixels (about CITY_PIXEL_CSS CSS
 * pixels, rounded to the device's ratio), the same on every viewport: the
 * scene buffer is simply made as many city pixels wide and tall as fit, and
 * the composition adapts to that shape (see scene.js) instead of being
 * stretched. The buffer may overshoot the canvas by less than one city pixel;
 * the overshoot is cropped, never scaled.
 */
export const CITY_PIXEL_CSS = 3;

export function cityLayout(cssW, cssH, dpr = 1, devW = null, devH = null) {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const scale = Math.max(1, Math.round(CITY_PIXEL_CSS * ratio)); // device px per city px
  const dw = Math.max(1, Math.round(devW ?? cssW * ratio));
  const dh = Math.max(1, Math.round(devH ?? cssH * ratio));
  const w = Math.ceil(dw / scale);
  const h = Math.ceil(dh / scale);
  return {
    scale,
    devW: dw,
    devH: dh,
    w,
    h,
    // where the buffer's top-left lands on the canvas: centred across, flush with the bottom edge
    offsetX: -Math.floor((w * scale - dw) / 2),
    offsetY: dh - h * scale,
  };
}
