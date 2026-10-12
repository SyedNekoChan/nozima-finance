import { useEffect, useRef } from 'react';
import { easeCss } from './motion.js';

/*
 * One temporary environmental object in the pet's persistent world: a small
 * pixel canvas placed with the same perspective transform as the pet, so it
 * has a real X / Y / Z position and scales with depth. It is part of the
 * global backdrop layer: it belongs to no tab, sits behind all foreground
 * UI, and never intercepts the pointer (the shared `nomoz-actor` /
 * `nomoz-canvas` classes are pointer-events: none with pixelated scaling).
 * Appearance changes are driven by the owning behavior's script through
 * `spec`; there is no animation loop here. A spec may ask for its moves to
 * glide (`moveMs`, `ease`: the same transition the pet uses) and for a
 * quicker or slower fade (`fadeMs`); under reduced motion both are instant.
 */
export default function EnvProp({ spec, def, world, geo, scale, frame, reduced = false }) {
  const ref = useRef(null);
  const failed = useRef(false);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || failed.current) return;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    try {
      def.render(ctx, spec, frame);
    } catch (err) {
      failed.current = true; // a broken prop draws nothing; the app carries on
      console.warn('[pets] prop drawing stopped:', err);
    }
  }, [def, spec, frame]);

  const w = def.width * scale;
  const h = def.height * scale;
  const opacity =
    Math.min(world.config.alpha.ceiling, world.alphaAt(spec.z, geo.compact)) * (spec.fade ?? 1);
  const moveMs = reduced ? 0 : spec.moveMs || 0;
  const fade = spec.fadeMs == null ? 'var(--motion-ambient)' : `${reduced ? 0 : spec.fadeMs}ms`;

  return (
    <div
      aria-hidden="true"
      className="nomoz-actor"
      style={{
        width: w,
        height: h,
        transform: world.toTransform(spec, { ...geo, spriteW: w, spriteH: h }),
        opacity,
        transition: `transform ${moveMs}ms ${easeCss(spec.ease)}, opacity ${fade} var(--motion-ease)`,
      }}
    >
      <canvas ref={ref} width={def.width} height={def.height} className="nomoz-canvas" />
    </div>
  );
}
