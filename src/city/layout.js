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

/*
 * cssW x cssH: the canvas (in City mode, the whole screen). view: the CSS
 * rows of the canvas that are the scene proper, { top, bottom } (in City
 * mode, the area between the header and the footer); without it, the whole
 * canvas. The view's rows are exactly those of a canvas the view's size (its
 * bottom edge falls on a city-pixel boundary, as that canvas's did), the
 * buffer carries on above and below it to the canvas's edges, and the rows
 * above the view are a multiple of 4, so the ordered dither of the view is
 * that canvas's too. `view` in the result is { y0, h } in buffer rows.
 */
export function cityLayout(cssW, cssH, dpr = 1, devW = null, devH = null, view = null) {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const scale = Math.max(1, Math.round(CITY_PIXEL_CSS * ratio)); // device px per city px
  const dw = Math.max(1, Math.round(devW ?? cssW * ratio));
  const dh = Math.max(1, Math.round(devH ?? cssH * ratio));
  const w = Math.ceil(dw / scale);
  const offsetX = -Math.floor((w * scale - dw) / 2); // centred across
  if (!view) {
    const h = Math.ceil(dh / scale);
    return { scale, devW: dw, devH: dh, w, h, offsetX, offsetY: dh - h * scale, view: { y0: 0, h } };
  }
  const vTop = Math.max(0, Math.min(dh, Math.round(view.top * ratio)));
  const vBottom = Math.max(vTop + 1, Math.min(dh, Math.round(view.bottom * ratio)));
  const vh = Math.ceil((vBottom - vTop) / scale); // as the view's own canvas would be, flush with its bottom
  const y0 = Math.ceil(Math.max(0, Math.ceil(vBottom / scale) - vh) / 4) * 4; // rows above the view, to the top
  const below = Math.ceil((dh - vBottom) / scale);
  const h = y0 + vh + below;
  return { scale, devW: dw, devH: dh, w, h, offsetX, offsetY: vBottom - (y0 + vh) * scale, view: { y0, h: vh } };
}
