import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

/*
 * The Footer is `fixed`-stacked (z-50) but participates in the root
 * flex column's normal layout flow (flex-shrink-0) — it is NOT
 * position:fixed, so it doesn't overlay content by default. Modal,
 * however, IS `fixed inset-0`, which takes it completely out of that
 * flex flow: at small viewport heights, Modal's own "h-full
 * [height:100dvh]" sizing has no way to know Footer occupies real
 * space at the bottom of the screen, so the modal shell can end up
 * genuinely sitting underneath Footer instead of stopping above it.
 *
 * Rather than hard-code a pixel value or a single breakpoint's worth
 * of padding (which drifts the moment Footer's own responsive
 * classes change, e.g. py-2 vs md:py-3, or wrapping at very narrow
 * widths), this measures Footer's ACTUAL rendered height with
 * ResizeObserver and republishes it, so Modal always sizes against
 * the real current chrome.
 */
const ViewportChromeContext =
  createContext({ footerHeight: 0 });

export function ViewportChromeProvider({
  children,
}) {
  const [footerHeight, setFooterHeight] =
    useState(0);

  const footerRef = useRef(null);

  useEffect(() => {
    const node = footerRef.current;

    if (!node) return undefined;

    const observer =
      new ResizeObserver(
        (entries) => {
          const entry = entries[0];

          if (entry) {
            setFooterHeight(
              entry.contentRect
                .height
            );
          }
        }
      );

    observer.observe(node);

    setFooterHeight(
      node.getBoundingClientRect()
        .height
    );

    return () =>
      observer.disconnect();
  }, []);

  return (
    <ViewportChromeContext.Provider
      value={{
        footerHeight,
        footerRef,
      }}
    >
      {children}
    </ViewportChromeContext.Provider>
  );
}

// Consumed by Footer itself to attach the measuring ref.
export function useFooterMeasureRef() {
  const { footerRef } = useContext(
    ViewportChromeContext
  );

  return footerRef;
}

// Consumed by anything that needs to avoid sitting under the footer
// (currently just Modal).
export function useFooterHeight() {
  const { footerHeight } = useContext(
    ViewportChromeContext
  );

  return footerHeight;
}
