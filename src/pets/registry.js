import { ACTIVE_PET_ID, DEFAULT_PET_ID } from './config.js';
import nomoz from './nomoz/index.js';

/*
 * Pet registry and selection.
 *
 *   registerPet(definePet({...}))   add a pet
 *   getPet(id)                      look one up
 *   listPets()                      everything registered
 *   getActivePet()                  the pet mounted in the backdrop
 *
 * NOMOZ.EXE is registered first and is the default and fallback. Swapping
 * pets means registering another definition and changing ACTIVE_PET_ID
 * (config.js); the backdrop, movement engine, financial mood, modals and
 * scheduler are shared and untouched.
 */

const pets = new Map();

export function registerPet(pet) {
  if (!pet || typeof pet.id !== 'string' || typeof pet.sprite?.render !== 'function') {
    console.warn('[pets] registerPet expects a definePet(...) result');
    return false;
  }
  pets.set(pet.id, pet);
  return true;
}

export const getPet = (id) => pets.get(id);
export const listPets = () => [...pets.values()];

export function getActivePet() {
  return pets.get(ACTIVE_PET_ID) || pets.get(DEFAULT_PET_ID);
}

registerPet(nomoz); // always first
