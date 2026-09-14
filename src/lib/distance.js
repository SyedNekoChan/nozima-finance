import { MY_COORDS, HER_COORDS, DISTANCE_KM } from './constants.js';

const EARTH_RADIUS_KM = 6371;

const toRadians = (deg) => (deg * Math.PI) / 180;

export function haversine(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_KM * c * 10) / 10;
}

export function getDistanceBetweenUs() {
  const valid = (c) => c && typeof c.lat === 'number' && typeof c.lon === 'number';

  // Hardcoded constant is the safety net if constants.js is ever trimmed
  if (!valid(MY_COORDS) || !valid(HER_COORDS)) return DISTANCE_KM;

  return haversine(MY_COORDS.lat, MY_COORDS.lon, HER_COORDS.lat, HER_COORDS.lon);
}

export function formatDistance(km) {
  const value = Math.round(Number(km) || 0);
  return `${value.toLocaleString('en-US')} KM`;
}
