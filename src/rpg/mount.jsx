import { lazy, Suspense } from 'react';
import useRpgStore from './state/store.js';
import { closeRpg } from './gate.js';
import RpgErrorBoundary from './host/RpgErrorBoundary.jsx';

if (import.meta.env.DEV) {
  import('./dev.js').then((m) => m.installDevActivation()).catch(() => {});
}

// Loaded only once the RPG is activated, so ordinary use never fetches it.
const RpgHost = lazy(() => import('./host/RpgHost.jsx'));

/*
 * Single integration point for the finance app. Renders nothing unless the
 * RPG is active; rendering lives beside, never inside, the finance tree.
 */
export default function RpgMount() {
  const status = useRpgStore((s) => s.status);

  return (
    <RpgErrorBoundary onFail={closeRpg} resetKey={status}>
      {status !== 'inactive' && (
        <Suspense fallback={null}>
          <RpgHost />
        </Suspense>
      )}
    </RpgErrorBoundary>
  );
}
