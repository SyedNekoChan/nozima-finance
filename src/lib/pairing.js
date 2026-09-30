import * as bip39 from 'bip39';

/*
 * ================================================================
 * CANONICAL PAIRING SECRET
 * ================================================================
 *
 * The 128-bit entropy generated here is the ONLY security secret in
 * the sync system. Every other value (mnemonic, QR payload, manual
 * confirmation code, room id, room password, Yjs DB name) is either
 * a representation of it or a one-way derivation from it.
 */

const DERIVATION_VERSION = 'v1';

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBytes(b64url) {
  const padded =
    b64url.replace(/-/g, '+').replace(/_/g, '/') +
    '==='.slice((b64url.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/*
 * Generate new canonical 128-bit (16 byte) pairing entropy.
 */
export function generateSecretBytes() {
  return crypto.getRandomValues(new Uint8Array(16));
}

export function secretToBase64Url(secretBytes) {
  return bytesToBase64Url(secretBytes);
}

export function base64UrlToSecret(b64url) {
  return base64UrlToBytes(b64url);
}

/*
 * ================================================================
 * BIP-39 REPRESENTATION
 * ================================================================
 *
 * Human-readable / recovery-key representation of the canonical
 * secret. Carries no independent authority; round-trips exactly to
 * the same entropy bytes.
 */

export function secretToMnemonic(secretBytes) {
  return bip39.entropyToMnemonic(bytesToHex(secretBytes));
}

function normalizeMnemonic(mnemonic) {
  return String(mnemonic || '').trim().toLowerCase().split(/\s+/).join(' ');
}

export function mnemonicToSecret(mnemonic) {
  const hex = bip39.mnemonicToEntropy(normalizeMnemonic(mnemonic));
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function isValidMnemonic(mnemonic) {
  try {
    return bip39.validateMnemonic(normalizeMnemonic(mnemonic));
  } catch {
    return false;
  }
}

/*
 * ================================================================
 * HKDF-SHA256 DERIVATION (versioned)
 * ================================================================
 *
 * roomId and roomPassword are independent one-way derivations of the
 * canonical secret via distinct HKDF "info" strings. Neither the raw
 * secret nor the mnemonic nor the manual code is ever used directly
 * as a room id or password.
 */

async function hkdf(secretBytes, infoString, bitLength) {
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    'HKDF',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(infoString),
    },
    key,
    bitLength
  );

  return new Uint8Array(bits);
}

export async function deriveRoomId(secretBytes) {
  const bytes = await hkdf(
    secretBytes,
    `nozima-sync-room-${DERIVATION_VERSION}`,
    128
  );
  return bytesToHex(bytes);
}

export async function deriveRoomPassword(secretBytes) {
  const bytes = await hkdf(
    secretBytes,
    `nozima-sync-password-${DERIVATION_VERSION}`,
    256
  );
  return bytesToHex(bytes);
}

/*
 * Secret-scoped local Yjs IndexedDB name.
 *
 * Different pairing secrets MUST resolve to different local Yjs
 * databases so one device's old pair can never bleed into a new
 * pair. Derived from roomId (itself a one-way derivation) rather
 * than the raw secret, since it does not need to be kept secret.
 */
export async function deriveYjsDbName(secretBytes) {
  const roomId = await deriveRoomId(secretBytes);
  return `nozima-finance-yjs-${roomId.slice(0, 12)}`;
}

/*
 * ================================================================
 * PAIRING CODE / CONFIRMATION CODE (independent of the sync secret)
 * ================================================================
 *
 * Pairing code: ~59 random bits, rendezvous identifier only. It is NOT
 * derived from, and reveals nothing about, the sync secret or the
 * confirmation code.
 *
 * Confirmation code: 6 random digits, generated and stored ONLY on the
 * generating device and verified there (rate-limited) before the sync
 * secret is released to a joining device.
 */

// No 0/1/I/L/O to avoid visually ambiguous characters.
const PAIRING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PAIRING_LENGTH = 12;

function randomInt(limit) {
  const max = Math.floor(256 / limit) * limit;
  const buf = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < max) return buf[0] % limit;
  }
}

export function formatPairingCode(normalized) {
  return normalized.match(/.{1,4}/g).join('-');
}

export function generatePairingCode() {
  let out = '';
  for (let i = 0; i < PAIRING_LENGTH; i += 1) {
    out += PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)];
  }
  return formatPairingCode(out);
}

export function normalizePairingCode(input) {
  const raw = String(input || '').toUpperCase().replace(/[\s-]+/g, '');

  if (!raw) throw new Error('EMPTY PAIRING CODE');

  if (/^\d{6}$/.test(raw)) {
    throw new Error('THAT IS A CONFIRMATION CODE. ENTER THE PAIRING CODE');
  }

  if (
    raw.length !== PAIRING_LENGTH ||
    [...raw].some((c) => !PAIRING_ALPHABET.includes(c))
  ) {
    throw new Error('MALFORMED PAIRING CODE');
  }

  return raw;
}

export function generateConfirmationCode() {
  const buf = new Uint32Array(1);
  const limit = 4294000000;
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return String(buf[0] % 1000000).padStart(6, '0');
  }
}

export function normalizeConfirmationCode(input) {
  const raw = String(input || '').replace(/[\s-]+/g, '');

  if (!/^\d{6}$/.test(raw)) {
    throw new Error('CONFIRMATION CODE MUST BE 6 DIGITS');
  }

  return raw;
}

export function generateDeviceId() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(8)));
}

/*
 * Rendezvous room + signaling password for the pairing handshake,
 * derived one-way from the (normalized) pairing code.
 */
export async function derivePairingRoom(normalizedCode) {
  const material = new TextEncoder().encode(normalizedCode);

  return {
    roomId: bytesToHex(
      await hkdf(material, `nozima-pair-room-${DERIVATION_VERSION}`, 128)
    ),
    password: bytesToHex(
      await hkdf(material, `nozima-pair-password-${DERIVATION_VERSION}`, 256)
    ),
  };
}

/*
 * ================================================================
 * PAIRING SESSION CRYPTO (signaling-level handshake)
 * ================================================================
 *
 * The pairing code only derives the rendezvous room. Everything
 * sensitive inside it (confirmation attempt, released sync secret) is
 * additionally encrypted with a per-session key from an ephemeral
 * ECDH exchange between the generator and ONE joining session, so
 * brokers and other holders of the pairing code never see it.
 */

export async function createPairingKeyPair() {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));

  return { privateKey: pair.privateKey, pub: bytesToBase64Url(raw) };
}

export async function derivePairingSessionKey(privateKey, peerPub, sessionId, normalizedCode) {
  const peer = await crypto.subtle.importKey(
    'raw',
    base64UrlToBytes(peerPub),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256)
  );
  const keyBytes = await hkdf(
    shared,
    `nozima-pair-session-${DERIVATION_VERSION}:${sessionId}:${normalizedCode}`,
    256
  );

  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptJson(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)
  );
  const out = new Uint8Array(iv.length + cipher.length);

  out.set(iv, 0);
  out.set(cipher, iv.length);

  return bytesToBase64Url(out);
}

export async function decryptJson(key, encoded) {
  const bytes = base64UrlToBytes(String(encoded));
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, 12) },
    key,
    bytes.slice(12)
  );

  return JSON.parse(new TextDecoder().decode(plain));
}
