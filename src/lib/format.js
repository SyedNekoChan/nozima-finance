/*
 * Presentation-only formatting. Nothing here changes a stored value or a
 * calculation: amounts still go through formatAmount (lib/currency.js),
 * names and categories are stored exactly as before.
 */
import { formatAmount } from './currency.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const monthLong = (m0) => MONTHS[m0] || '';
export const monthShort = (m0) => MONTHS_SHORT[m0] || '';

// "DD-MM-YYYY" -> Date
export const parseDMY = (s) => {
  const [d, m, y] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
};

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// "Today", "Yesterday", or "Monday, 16 November" (the year only when it is not this year)
export function dayHeading(dateStr, now = new Date()) {
  const d = parseDMY(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, y)) return 'Yesterday';
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

// "16 Nov" / "16 Nov 2025"
export function shortDate(dateStr, now = new Date()) {
  const d = parseDMY(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${year}`;
}

// "Thursday, 12 November 2026"
export function longDate(dateStr) {
  const d = parseDMY(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// account names are stored as MAIN_BANK: shown as MAIN BANK
export const accountLabel = (name) => String(name || 'Unknown').replace(/_/g, ' ');

// categories are stored as GROCERIES: shown as Groceries
export const categoryLabel = (c) => {
  if (!c) return 'Transfer';
  const s = String(c).replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const accountTypeLabel = (t) => ({ BANK: 'Bank', CASH: 'Cash', CREDIT: 'Credit', DEBT: 'Debt' })[t] || categoryLabel(t);

// 4,600,000 -> "4.6M", 185,000 -> "185K", 45,678,901,234,567 -> "45.7T"
export function compact(value) {
  const v = Math.abs(Number(value) || 0);
  const sign = value < 0 ? '−' : '';
  if (Math.round(v) < 1000) return `${sign}${Math.round(v)}`;
  // the smallest unit whose rounded figure stays under 1000 (999,999 -> 1M, not 1000K)
  const units = [['K', 1e3], ['M', 1e6], ['B', 1e9], ['T', 1e12], ['Q', 1e15]];
  for (let i = 0; i < units.length; i++) {
    const [unit, size] = units[i];
    const shown = unit === 'K' ? String(Math.round(v / size)) : trim(v / size);
    if (Number(shown) < 1000 || i === units.length - 1) return `${sign}${shown}${unit}`;
  }
  return `${sign}${Math.round(v)}`;
}
const trim = (n) => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1).replace(/\.0$/, '') : n.toFixed(2).replace(/0$/, '').replace(/\.0$/, ''));

/*
 * Splits formatAmount's output into the figure and the trailing currency
 * code, so the code can be set smaller: "8,450,000 UZS" -> ["8,450,000", "UZS"],
 * "$ 1,250.00 USD" -> ["$1,250.00", "USD"].
 */
export function splitAmount(value, currency) {
  const s = formatAmount(value, currency);
  const m = s.match(/^(.*?)\s+([A-Z]{3})$/);
  if (!m) return [s, ''];
  return [m[1].replace(/^(\D)\s+/, '$1'), m[2]];
}

// the figure only (no code), with a typographic minus
export const figure = (value, currency) => splitAmount(value, currency)[0].replace(/^-/, '−').replace(/^(\D)-/, '−$1');
