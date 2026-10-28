import SceneCanvas from '../sequence/SceneCanvas.jsx';
import { sceneAt } from '../sequence/scene.js';
import { getClass } from '../data/classes/index.js';
import useRpgStore from '../state/store.js';
import { selectedClassId } from '../state/story.js';

// Minimal placeholder shown once a class has been chosen and saved.
export default function Screen() {
  const chosen = getClass(useRpgStore((s) => selectedClassId(s.save)));
  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-4">
      <SceneCanvas scene={sceneAt('entered', 1)} label="The portal into Nomoz" />
      <p role="status" className="text-center text-sm">
        {chosen ? `${chosen.name}, your adventure in Nomoz is about to begin.` : 'Your adventure in Nomoz is about to begin.'}
        <br />
        NOMOZ.EXE is somewhere in this world.
      </p>
    </div>
  );
}
