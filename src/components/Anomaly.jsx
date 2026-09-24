import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import useFinanceStore from '../hooks/useFinanceStore.js';
import { isSpecialDate } from '../lib/date.js';

const SPHERE_ARGS = [2, 64, 64];

function randomUnitVector() {
  // uniform sphere sampling
  const u = Math.random() * 2 - 1;
  const theta = Math.random() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);

  return new THREE.Vector3(
    r * Math.cos(theta),
    r * Math.sin(theta),
    u
  );
}

function heartTarget(base) {
  const { x, y, z } = base;

  let newX = x;
  const newY = y * 0.9 - 0.15;
  const newZ = z;

  if (y > 0.3) {
    const t = THREE.MathUtils.smoothstep(y, 0.3, 1.0);
    newX =
      x +
      Math.sign(x || 1) * 0.5 * t -
      x * t;
  }

  return new THREE.Vector3(
    newX,
    newY,
    newZ
  );
}

const MAX_OFFSET_PER_VERTEX = 0.6;

/*
 * Apply ONE financial event's permanent contribution to the
 * accumulated-offset buffer, in place. Called exactly once per event
 * (from the anomalyEvent useEffect), never per-frame.
 *
 * Each event type gets a visually distinct, spatially-localized-or-
 * global signature so the sphere's evolving shape stays legible as
 * "more income happened here" vs "more spend happened there" rather
 * than washing into uniform noise:
 *
 * - INCOME:  a localized outward bump at a random point (spike).
 * - EXPENSE: a localized inward dent at a random point.
 * - TRANSFER: a low-amplitude wave applied globally (using each
 *   vertex's own base position, not a random target), so transfers
 *   read as a ripple across the whole sphere rather than one spot —
 *   consistent with design.md's "rippling wave" — and repeated
 *   transfers keep adding gentle ripples rather than one single dent.
 * - OVERSPEND: same shape as EXPENSE (a harder inward dent), since
 *   overspending IS an expense that crossed the budget threshold;
 *   the violent glitch remains a SEPARATE, transient, non-accumulating
 *   effect layered on top by the existing eventsRef/glitch system.
 *
 * Every contribution is added onto whatever is already in the buffer
 * (never overwritten), and each vertex's total is clamped to
 * +/-MAX_OFFSET_PER_VERTEX so unbounded activity roughens the sphere
 * further without any single point ever spiking off to infinity.
 */
function applyPersistentDisplacement(
  offsets,
  basePositions,
  baseNormals,
  vertexCount,
  type
) {
  const tmpB = new THREE.Vector3();
  const tmpN = new THREE.Vector3();

  if (type === 'TRANSFER') {
    // Global low-amplitude ripple: every vertex gets a small nudge
    // derived from its own position, so the whole sphere gains a
    // subtle wave rather than one localized mark.
    const amplitude = 0.025;
    const frequency = 4.5;
    const phase =
      Math.random() * Math.PI * 2;

    for (
      let i = 0;
      i < vertexCount;
      i++
    ) {
      const i3 = i * 3;

      tmpB.set(
        basePositions[i3],
        basePositions[i3 + 1],
        basePositions[i3 + 2]
      );

      const wave =
        Math.sin(
          tmpB.x * frequency +
            tmpB.y * frequency +
            phase
        ) * amplitude;

      offsets[i] =
        THREE.MathUtils.clamp(
          offsets[i] + wave,
          -MAX_OFFSET_PER_VERTEX,
          MAX_OFFSET_PER_VERTEX
        );
    }

    return;
  }

  // INCOME / EXPENSE / OVERSPEND: a localized bump or dent centered
  // on a random point on the sphere, added onto the buffer.
  const target = randomUnitVector();

  const intensity =
    type === 'INCOME' ? 0.35 : -0.3;

  const spread = 6;

  for (
    let i = 0;
    i < vertexCount;
    i++
  ) {
    const i3 = i * 3;

    tmpN.set(
      baseNormals[i3],
      baseNormals[i3 + 1],
      baseNormals[i3 + 2]
    );

    const dist =
      tmpN.distanceTo(target);

    const falloff = Math.exp(
      -dist * dist * spread
    );

    offsets[i] =
      THREE.MathUtils.clamp(
        offsets[i] +
          intensity * falloff,
        -MAX_OFFSET_PER_VERTEX,
        MAX_OFFSET_PER_VERTEX
      );
  }
}

function SpherePoints() {
  const pointsRef = useRef();
  const geomRef = useRef();
  const materialRef = useRef();

  const anomalyEvent = useFinanceStore(
    (s) => s.anomalyEvent
  );

  const clearAnomalyEvent = useFinanceStore(
    (s) => s.clearAnomalyEvent
  );

  /*
   * Persistent STATE (not the one-shot event): re-derived from
   * budget/spend on every render. Drives an ongoing "living" idle
   * reaction — ambient breathing gets stronger and less regular
   * while over budget — fully independent of anomalyEvent, so it
   * cannot repeat-fire and needs no clearing.
   */
  const isOverBudget = useFinanceStore(
    (s) => s.getIsOverBudgetThisMonth()
  );

  const geometry = useMemo(
    () => new THREE.SphereGeometry(...SPHERE_ARGS),
    []
  );

  const basePositions = useMemo(
    () =>
      geometry.attributes.position.array.slice(),
    [geometry]
  );

  const baseNormals = useMemo(
    () =>
      geometry.attributes.normal.array.slice(),
    [geometry]
  );

  const vertexCount =
    basePositions.length / 3;

  /*
   * PERSISTENT accumulated per-vertex displacement, separate from the
   * transient event system below. Unlike eventsRef (which decays via
   * `life` and disappears), this buffer is written to ONCE per
   * financial event — inside the anomalyEvent useEffect, never inside
   * the per-frame loop — and then simply read every frame exactly
   * like basePositions/baseNormals, alongside idle breathing and any
   * active transient reaction. Because the per-frame loop always
   * rebuilds tmpVec from tmpBase (the immutable unit-sphere vertex)
   * and never writes back into this buffer or into basePositions
   * itself, there is no frame-to-frame drift: re-rendering,
   * re-mounting the glitch, or idle breathing can never accumulate
   * additional displacement on their own — only a genuine new
   * anomalyEvent can.
   *
   * Clamped per-vertex (see applyPersistentDisplacement) so repeated
   * events roughen the sphere further without ever able to blow a
   * single vertex out arbitrarily far.
   */
  const accumulatedOffsets = useRef(
    new Float32Array(vertexCount)
  );

  const eventsRef = useRef([]);
  const glitchUntilRef = useRef(0);
  const rotationRef = useRef(0);

  // Heart morph state:
  // null = not running,
  // otherwise seconds elapsed since trigger.
  const heartRef = useRef(
    isSpecialDate(new Date()) ? 0 : null
  );

  // Calendar day on which the heart animation last played.
  const heartPlayedDateRef = useRef(
    isSpecialDate(new Date())
      ? new Date().toDateString()
      : null
  );

  // Throttle calendar checks instead of
  // running them every frame.
  const lastDateCheckRef = useRef(0);

  const tmpVec = useMemo(
    () => new THREE.Vector3(),
    []
  );

  const tmpBase = useMemo(
    () => new THREE.Vector3(),
    []
  );

  const tmpNormal = useMemo(
    () => new THREE.Vector3(),
    []
  );

  const tmpTarget = useMemo(
    () => new THREE.Vector3(),
    []
  );

  useEffect(() => {
    if (!anomalyEvent) return;

    if (
      anomalyEvent.type === 'INCOME' ||
      anomalyEvent.type === 'EXPENSE' ||
      anomalyEvent.type === 'TRANSFER' ||
      anomalyEvent.type === 'OVERSPEND'
    ) {
      /*
       * Permanent contribution: written once, directly into the
       * accumulated-offset buffer. This replaces the old transient
       * "spike that decays back to the base sphere" behavior for
       * these four event types — the sphere's shape now evolves
       * with financial history instead of resetting.
       */
      applyPersistentDisplacement(
        accumulatedOffsets.current,
        basePositions,
        baseNormals,
        vertexCount,
        anomalyEvent.type
      );
    }

    if (anomalyEvent.type === 'OVERSPEND') {
      /*
       * OVERSPEND additionally gets the existing strong, TRANSIENT
       * glitch (violent jitter + 15% shrink) on top of the permanent
       * dent applied above — the glitch itself still fully decays;
       * only the underlying shape change from applyPersistentDisplacement
       * remains afterward.
       */
      glitchUntilRef.current =
        performance.now() + 3000;
    } else if (
      anomalyEvent.type === 'CELEBRATE'
    ) {
      // CELEBRATE is not a financial-history event (no store action
      // currently dispatches it) — kept as the original one-shot,
      // fully-transient reaction via eventsRef, unrelated to the
      // persistent accumulation model above.
      eventsRef.current.push({
        type: 'CELEBRATE',
        target: randomUnitVector(),
        life: 1.0,
        duration: 2.0,
        intensity: 0.6,
      });
    }

    clearAnomalyEvent();
  }, [
    anomalyEvent,
    clearAnomalyEvent,
    basePositions,
    baseNormals,
    vertexCount,
  ]);

  useFrame((state, delta) => {
    const geom = geomRef.current;

    if (!geom) return;

    const posAttr =
      geom.attributes.position;

    const time =
      state.clock.elapsedTime;

    const isGlitching =
      performance.now() 
      glitchUntilRef.current;

    // Rotation: frozen during glitch. Slightly faster, still linear,
    // while the persistent over-budget state holds — restrained
    // "alive" motion, not a spring/bounce.
    if (!isGlitching) {
      const revolutionSeconds =
        isOverBudget ? 30 : 45;

      rotationRef.current +=
        delta *
        ((Math.PI * 2) /
          revolutionSeconds);
    }

    if (pointsRef.current) {
      pointsRef.current.rotation.y =
        rotationRef.current;
    }

    // Advance and prune financial-event reactions.
    const events = eventsRef.current;

    for (
      let i = events.length - 1;
      i >= 0;
      i--
    ) {
      events[i].life -=
        delta / events[i].duration;

      if (events[i].life <= 0) {
        events.splice(i, 1);
      }
    }

    // Re-arm the heart sequence at most once per
    // special calendar day.
    const nowMs =
      performance.now();

    if (
      nowMs -
        lastDateCheckRef.current >
      1000
    ) {
      lastDateCheckRef.current =
        nowMs;

      const today = new Date();

      const todayStr =
        today.toDateString();

      if (
        isSpecialDate(today) &&
        heartPlayedDateRef.current !==
          todayStr &&
        heartRef.current === null
      ) {
        heartRef.current = 0;
        heartPlayedDateRef.current =
          todayStr;
      }
    }

    // Heart morph timeline:
    // 0-3 morph in,
    // 3-8 hold,
    // 8-11 morph out,
    // then done.
    let heartT =
      heartRef.current;

    let morphProgress = 0;

    if (heartT !== null) {
      heartT += delta;
      heartRef.current = heartT;

      if (heartT < 3) {
        morphProgress =
          heartT / 3;
      } else if (heartT < 8) {
        morphProgress = 1;
      } else if (heartT < 11) {
        morphProgress =
          1 -
          (heartT - 8) / 3;
      } else {
        morphProgress = 0;
        heartRef.current = null;
      }
    }

    for (
      let i = 0;
      i < vertexCount;
      i++
    ) {
      const i3 = i * 3;

      tmpBase.set(
        basePositions[i3],
        basePositions[i3 + 1],
        basePositions[i3 + 2]
      );

      tmpNormal.set(
        baseNormals[i3],
        baseNormals[i3 + 1],
        baseNormals[i3 + 2]
      );

      // Idle breathing. Persistent over-budget STATE (not the
      // one-shot event) widens and roughens this, so the sphere reads
      // as "currently living in an anomalous state" continuously,
      // distinct from the sharp one-shot OVERSPEND glitch below.
      const breathAmplitude =
        isOverBudget ? 0.07 : 0.03;

      const breathSpeed =
        isOverBudget ? 0.9 : 0.5;

      const idleDisp =
        Math.sin(
          time * breathSpeed +
            tmpBase.x * 2 +
            tmpBase.y * 2
        ) * breathAmplitude;

      /*
       * Persistent, ACCUMULATED displacement from financial history
       * (INCOME/EXPENSE/TRANSFER/OVERSPEND) — read here as a stable
       * input alongside idle breathing, exactly like basePositions/
       * baseNormals. This is the vertex's evolving "shape", separate
       * from the moment-to-moment idle wobble above: it only changes
       * when applyPersistentDisplacement runs (once per event), never
       * inside this per-frame loop, so summing it in here every frame
       * cannot itself cause drift.
       */
      const persistentDisp =
        accumulatedOffsets.current[
          i
        ];

      tmpVec
        .copy(tmpBase)
        .addScaledVector(
          tmpNormal,
          idleDisp + persistentDisp
        );

      // Financial-event reactions still active in eventsRef are, as
      // of the persistent-accumulation model above, CELEBRATE only —
      // INCOME/EXPENSE/TRANSFER/OVERSPEND no longer push a transient
      // entry here (their effect is the permanent offset applied
      // above instead).
      for (
        let e = 0;
        e < events.length;
        e++
      ) {
        const ev =
          events[e];

        tmpVec.addScaledVector(
          tmpNormal,
          ev.intensity * ev.life
        );
      }

      // Overspend glitch: jitter + shrink, layered ON TOP OF the
      // persistently-displaced shape (tmpVec as already computed
      // above), NOT a reset back to the raw base sphere — the
      // permanent dent from this same OVERSPEND event must still be
      // visible once the glitch itself ends. The 15% shrink is now a
      // uniform scale of the CURRENT (persistent-offset-inclusive)
      // vector rather than of the raw base, so it still reads as
      // "shrink" during the glitch while preserving the evolving
      // shape underneath once isGlitching ends.
      if (isGlitching) {
        const jitter =
          0.15 * Math.random() -
          0.075;

        tmpVec.addScaledVector(
          tmpNormal,
          jitter
        );

        tmpVec.multiplyScalar(0.85);
      }

      // Heart morph.
      if (morphProgress > 0) {
        tmpTarget.copy(
          heartTarget(tmpBase)
        );

        tmpVec.lerp(
          tmpTarget,
          morphProgress
        );
      }

      posAttr.setXYZ(
        i,
        tmpVec.x,
        tmpVec.y,
        tmpVec.z
      );
    }

    posAttr.needsUpdate = true;

    if (materialRef.current) {
      materialRef.current.opacity = isGlitching
        ? 0.9
        : isOverBudget
        ? 0.75
        : 0.6;
    }
  });

  useEffect(() => {
    return () => {
      geometry.dispose();

      if (materialRef.current) {
        materialRef.current.dispose();
      }
    };
  }, [geometry]);

  /*
   * `size.width` (CSS pixels) and `viewport.width` (world units) are
   * both already known to react-three-fiber for the SAME canvas, so
   * their ratio gives an exact world-units-per-CSS-pixel conversion
   * with no separate trigonometry to keep in sync with the camera.
   * BLUR_MAX_PX matches the larger of the two blur classes actually
   * applied below (blur-lg, the over-budget state) so the margin
   * covers the worst case regardless of which state is active.
   */
  const { viewport, size } = useThree();

  const worldUnitsPerPixel =
    viewport.width / size.width;

  const BLUR_MAX_PX = 16; // Tailwind blur-lg

  const blurMarginWorld =
    BLUR_MAX_PX * worldUnitsPerPixel;

  const usableHalfWidth = Math.max(
    0,
    viewport.width / 2 -
      blurMarginWorld
  );

  const sphereRadius = Math.min(
    2,
    usableHalfWidth
  );

  const offsetX = Math.min(
    2.5,
    Math.max(
      0,
      usableHalfWidth - sphereRadius
    )
  );

  const sphereScale =
    sphereRadius / 2;

  return (
    <points
      ref={pointsRef}
      position={[offsetX, 0, 0]}
      scale={sphereScale}
    >
      <primitive
        object={geometry}
        ref={geomRef}
        attach="geometry"
      />

      <pointsMaterial
        ref={materialRef}
        size={0.07}
        color="#888888"
        sizeAttenuation
        transparent
        opacity={0.6}
        depthWrite={false}
      />
    </points>
  );
}

/*
 * Persistent status readout. Purely level-based (re-reads store state
 * on every render) — completely separate from anomalyEvent, so it
 * can never repeat-fire and needs no dismiss/clear. It is the
 * design.md "[ ! OVER BUDGET ! ]" indicator, now surfaced once at the
 * app shell so it stays visible across Dashboard/Ledger/Calendar/
 * Accounts without duplicating the anomaly component per page.
 * AsciiProgressBar (Dashboard's budget bar) intentionally no longer
 * renders this same string, so this is the single authoritative
 * OVER BUDGET indicator on every screen including Dashboard.
 *
 * Positioned as a small fixed terminal readout rather than a toast:
 * top-anchored, inset from the edges by viewport-relative spacing
 * plus safe-area insets on all three sides so it never touches the
 * screen edge (or sits under a notch/rounded corner) on any phone,
 * sized with clamp-style responsive text so it stays legible without
 * becoming either a tiny effect or an oversized banner, and sits at
 * z-20 — above ordinary tab content (z-10) but below Header (z-30),
 * Footer (z-50) and Modal (z-50), so it never covers navigation or
 * dialogs.
 */
function OverBudgetIndicator({ isOverBudget }) {
  if (!isOverBudget) return null;

  return (
    <div
      className="absolute z-20 pointer-events-none flex justify-center"
      style={{
        top: 'max(0.375rem, env(safe-area-inset-top))',
        left: 'max(0.5rem, env(safe-area-inset-left))',
        right: 'max(0.5rem, env(safe-area-inset-right))',
      }}
    >
      <span
        className="font-mono font-bold uppercase tracking-widest text-white bg-black border border-white px-1.5 py-px whitespace-nowrap brutalist-overbudget-pulse"
        style={{
          fontSize: 'clamp(0.5rem, 2.2vw, 0.65rem)',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        [ ! OVER BUDGET ! ]
      </span>
    </div>
  );
}

export default function Anomaly() {
  const isOverBudget = useFinanceStore(
    (s) => s.getIsOverBudgetThisMonth()
  );

  return (
    <>
      {/*
        Ambient sphere layer stays at z-0 (behind every tab's z-10
        content), exactly as design.md specifies — a background
        presence, not a foreground one.
      */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div
          className={`absolute inset-0 !pointer-events-none transition-none ${
            isOverBudget
              ? 'blur-lg opacity-70'
              : 'blur-md opacity-45'
          }`}
        >
          <Canvas
            style={{
              pointerEvents: 'none',
            }}
            camera={{
              position: [0, 0, 6],
              fov: 60,
            }}
            dpr={[1, 1.5]}
            gl={{
              antialias: false,
            }}
          >
            <SpherePoints />
          </Canvas>
        </div>
      </div>

      {/*
        The status readout is a SEPARATE top-level layer (its own
        stacking context, z-20) rather than nested inside the z-0
        sphere wrapper above — nesting it there would have capped its
        effective stacking order at z-0, hiding it behind every tab's
        z-10 content on Dashboard/Ledger/Calendar/Accounts alike.
      */}
      <OverBudgetIndicator isOverBudget={isOverBudget} />
    </>
  );
}
