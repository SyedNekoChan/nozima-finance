export const HER_NAME_CYRILLIC = 'НОЗИМА_';
export const BUILDER_NAME = 'Syed AliAkbar Rizvi';

// All balances and net worth convert to this before display
export const PRIMARY_CURRENCY = 'UZS';

// UZS intentionally empty — code suffix is used instead of a symbol
export const SPECIAL_CURRENCY_SYMBOLS = {
  UZS: '',
  USD: '$',
  EUR: '€',
  RUB: '₽',
  KZT: '₸',
  TRY: '₺',
};

// MM-DD format — triggers the heart morph on the anomaly
export const SPECIAL_DATES = ['11-24'];

export const SYSTEM_MESSAGE = `> Hey. I built this for you. Every number, every dot, every line.
> I hope it helps. I hope you think of me when you use it.
> I'm proud of you. Always.
> - Syed AliAkbar Rizvi`;

// Account with this exact name renders the ♥ easter egg
export const FUTURE_FUND_NAME = 'OUR_FUTURE';

// Karachi
export const MY_COORDS = { lat: 24.8607, lon: 67.0011 };

// Tashkent
export const HER_COORDS = { lat: 41.2995, lon: 69.2401 };

// Precomputed fallback if haversine is unavailable
export const DISTANCE_KM = 1848;

// Units per 1 foreign unit, in UZS. Manually editable, persisted in IndexedDB
export const DEFAULT_EXCHANGE_RATES = {
  USD: 12650,
  EUR: 13800,
  RUB: 140,
  KZT: 25,
  TRY: 390,
};
