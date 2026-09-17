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

    const target = randomUnitVector();

    let duration = 2.5;
    let intensity = 0;

    if (anomalyEvent.type === 'INCOME') {
      intensity = 0.8;
      duration = 2.5;
    } else if (anomalyEvent.type === 'EXPENSE') {
      intensity = -0.5;
      duration = 2.5;
    } else if (anomalyEvent.type === 'TRANSFER') {
      intensity = 0.3;
      duration = 3.0;
    } else if (anomalyEvent.type === 'OVERSPEND') {
      intensity = -0.6;
      duration = 3.0;

      glitchUntilRef.current =
        performance.now() + 3000;
    } else if (anomalyEvent.type === 'CELEBRATE') {
      intensity = 0.6;
      duration = 2.0;
    }

    eventsRef.current.push({
      type: anomalyEvent.type,
      target,
      life: 1.0,
      duration,
      intensity,
    });

    clearAnomalyEvent();
  }, [
    anomalyEvent,
    clearAnomalyEvent,
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

      tmpVec
        .copy(tmpBase)
        .addScaledVector(
          tmpNormal,
          idleDisp
        );

      // Financial-event reactions.
      for (
        let e = 0;
        e < events.length;
        e++
      ) {
        const ev =
          events[e];

        if (
          ev.type === 'CELEBRATE'
        ) {
          tmpVec.addScaledVector(
            tmpNormal,
            ev.intensity * ev.life
          );

          continue;
        }

        const dist =
          tmpNormal.distanceTo(
            ev.target
          );

        const spread =
          ev.type === 'TRANSFER'
            ? 3
            : 12;

        const falloff =
          Math.exp(
            -dist * dist * spread
          );

        tmpVec.addScaledVector(
          tmpNormal,
          ev.intensity *
            falloff *
            ev.life
        );
      }

      // Overspend glitch:
      // jitter + shrink.
      if (isGlitching) {
        const jitter =
          0.15 * Math.random() -
          0.075;

        tmpVec
          .copy(tmpBase)
          .addScaledVector(
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
   * "Bleeds from right" (design.md) assumes a wide viewport. On a
   * narrow/tall mobile canvas the perspective frustum at this camera
   * distance is much narrower horizontally than on desktop, so a
   * fixed radius+offset pushes the sphere partly or fully outside the
   * visible frustum — the primary cause of geometric clipping on
   * small screens, not a CSS clip.
   *
   * There is a second, independent clipping source layered on top of
   * that: the whole sphere layer carries a CSS `blur` filter (see
   * Anomaly() below), and that blurred visual bloom is itself hard-
   * clipped by the wrapper's `overflow-hidden` at the exact viewport
   * edge. The blur's bloom, in world-space units, is NOT the same as
   * a fixed percentage margin — it scales with how many world units
   * one CSS pixel covers, which itself shrinks as the viewport gets
   * wider (more world width packed into the same frustum) and grows
   * on narrow phones (less world width per screen, so each CSS pixel
   * of blur "costs" more world-space). At the required mobile widths
   * this blur-bloom margin is larger than a flat 8% cushion would
   * cover, so the earlier fixed-percentage margin under-margined and
   * still let the blurred edge get visibly clipped.
   *
   * `size.width` (CSS pixels) and `viewport.width` (world units) are
   * both already known to react-three-fiber for the SAME canvas, so
   * their ratio gives an exact world-units-per-CSS-pixel conversion
   * with no separate trigonometry to keep in sync with the camera.
   * BLUR_MAX_PX matches the larger of the two blur classes actually
   * applied below (blur-2xl, the non-anomalous default state) so the
   * margin covers the worst case regardless of which state is active.
   */
  const { viewport, size } = useThree();

  const worldUnitsPerPixel =
    viewport.width / size.width;

  const BLUR_MAX_PX = 40; // Tailwind blur-2xl

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
        size={0.04}
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
        top: 'max(0.5rem, env(safe-area-inset-top))',
        left: 'max(0.5rem, env(safe-area-inset-left))',
        right: 'max(0.5rem, env(safe-area-inset-right))',
      }}
    >
      <span
        className="font-mono font-bold uppercase tracking-widest text-white bg-black border-2 border-white px-3 py-1 whitespace-nowrap brutalist-overbudget-pulse"
        style={{
          fontSize: 'clamp(0.65rem, 3.2vw, 0.95rem)',
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
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div
          className={`absolute inset-0 !pointer-events-none mix-blend-screen transition-none ${
            isOverBudget
              ? 'blur-xl opacity-50'
              : 'blur-2xl opacity-30'
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
