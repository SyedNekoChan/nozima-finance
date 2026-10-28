/*
 * 16x16 pixel-art sprites for the opening, as palette-indexed rows.
 * '.' is transparent. Drawn once into small canvases and scaled by whole
 * numbers, so every pixel stays crisp.
 */
export const PALETTE = {
  o: '#6b6b80', // outline / rim light
  k: '#0b0b10', // black fur
  e: '#c9ff8f', // cat eyes
  n: '#ff9bb0', // nose
  c: '#3a1f5c', // cloak
  d: '#24133d', // cloak shadow
  h: '#150a26', // hood interior
  r: '#ff4d4d', // sorcerer eyes
  s: '#8a6a3a', // staff
  g: '#ffd966', // staff gem
  w: '#e8e8f0', // skin / bone
};

export const CAT = [
  '................',
  '..oo........oo..',
  '..okoo....ooko..',
  '..okkkoooookko..',
  '..okkkkkkkkkko..',
  '..okekkkkkkeko..',
  '..okkkknnkkkko..',
  '...okkkkkkkko...',
  '..ookkkkkkkkoo.o',
  '..okkkkkkkkkkoko',
  '..okkkkkkkkkkkko',
  '..okkkkkkkkkkoo.',
  '..okkkkkkkkkko..',
  '..okkoo..ookko..',
  '..oooo....oooo..',
  '................',
];

export const SORCERER = [
  '.......oo.......',
  '......occo......',
  '.....occcco.....',
  '....occhhcco...g',
  '....ochhhhco..sg',
  '....ochrhrco..s.',
  '....ochhhhco..s.',
  '.....occcco...s.',
  '....occcccco..s.',
  '...occdccdcco.s.',
  '...occdccdcwos..',
  '..occcdccdcco...',
  '..occcdccdcco...',
  '.occcddccddcco..',
  '.occcddccddcco..',
  '.oooooooooooooo.',
];
