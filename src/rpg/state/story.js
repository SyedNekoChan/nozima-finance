import useRpgStore from './store.js';
import { OPENING_STEPS, STORY_STAGES } from '../data/content.js';
import { CLASS_IDS } from '../data/classes/index.js';

/*
 * Opening-sequence transitions. Each resolves true only after the new state
 * has been written to the RPG database; both are idempotent.
 */
export function commitTheft() {
  return useRpgStore.getState().updateSave((save) =>
    save.story.openingStep !== OPENING_STEPS.PORTAL
      ? save
      : { ...save, catMissing: true, story: { ...save.story, openingStep: OPENING_STEPS.STOLEN } }
  );
}

export function commitEntered() {
  return useRpgStore.getState().updateSave((save) => {
    if (save.story.openingStep === OPENING_STEPS.ENTERED) return save;
    if (save.story.openingStep !== OPENING_STEPS.STOLEN) return save; // cannot enter before the theft is saved
    return { ...save, story: { stage: STORY_STAGES.NOMOZ, openingStep: OPENING_STEPS.ENTERED } };
  });
}

export const selectedClassId = (save) => save?.protagonist?.classId ?? null;

/*
 * Fixes the protagonist's class for this adventure. Resolves true only once
 * the save holds exactly this class. An already-chosen class is never
 * overwritten (a different request resolves false) and repeating the same
 * request performs no second write.
 */
export async function commitClass(classId) {
  if (!CLASS_IDS.includes(classId)) return false;
  const ok = await useRpgStore.getState().updateSave((save) => {
    if (selectedClassId(save)) return save;
    if (save.story.openingStep !== OPENING_STEPS.ENTERED) return save; // class comes after entering Nomoz
    return { ...save, protagonist: { classId } };
  });
  return ok && selectedClassId(useRpgStore.getState().save) === classId;
}
