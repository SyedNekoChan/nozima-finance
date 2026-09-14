import { SPECIAL_DATES } from './constants.js';

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const pad = (n) => String(n).padStart(2, '0');

const toDate = (value) => (value instanceof Date ? value : new Date(value));

export function formatDate(date) {
  const d = toDate(date);
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

export function formatTime(date) {
  const d = toDate(date);
  const hours24 = d.getHours();
  const period = hours24 >= 12 ? 'PM' : 'AM';
  // Midnight and noon both render as 12
  const hours12 = hours24 % 12 || 12;
  return `${pad(hours12)}:${pad(d.getMinutes())} ${period}`;
}

export function getDaysInMonth(year, month) {
  // Day 0 of the next month is the last day of this one — leap years handled natively
  return new Date(year, month, 0).getDate();
}

export function getMonthName(month) {
  return MONTH_NAMES[month - 1] || '';
}

export function getTodayDateString() {
  return formatDate(new Date());
}

export function isSpecialDate(date) {
  let month;
  let day;

  if (typeof date === 'string') {
    const [dd, mm] = date.split('-');
    day = dd;
    month = mm;
  } else {
    const d = toDate(date);
    day = pad(d.getDate());
    month = pad(d.getMonth() + 1);
  }

  return SPECIAL_DATES.includes(`${month}-${day}`);
}

export function getLastNDays(n) {
  const today = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (n - 1 - i));
    return d;
  });
}

// "YYYY-MM" for the current month — used as the budgets object key
export function getCurrentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// number of days in the current month, for daily-allowance math
export function getDaysInCurrentMonth() {
  const d = new Date();
  return getDaysInMonth(d.getFullYear(), d.getMonth() + 1);
}
