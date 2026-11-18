import { create } from 'zustand';

/*
 * The personal note (SYSTEM_MESSAGE): open from the header mark or from the
 * distance line under the greeting. Session state only.
 */
const useNote = create((set) => ({
  open: false,
  setOpen: (open) => set({ open: !!open }),
}));

export default useNote;
