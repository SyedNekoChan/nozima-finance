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

export function mnemonicToSecret(mnemonic) {
  const hex = bip39.mnemonicToEntropy(mnemonic.trim().toLowerCase());
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function isValidMnemonic(mnemonic) {
  try {
    return bip39.validateMnemonic(mnemonic.trim().toLowerCase());
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
 * CONFIRMATION CODE (display-only, non-authoritative)
 * ================================================================
 *
 * Shown on both devices AFTER the secret has already been exchanged,
 * purely so the two people can visually confirm they paired with
 * each other. Never used to derive room id/password, never used as
 * manual pairing input, never transmitted, never persisted.
 */

export async function deriveConfirmationCode(secretBytes) {
  const encoder = new TextEncoder();
  const suffix = encoder.encode('confirm-v1');

  const combined = new Uint8Array(secretBytes.length + suffix.length);
  combined.set(secretBytes, 0);
  combined.set(suffix, secretBytes.length);

  const digest = await crypto.subtle.digest('SHA-256', combined);
  const hex = bytesToHex(new Uint8Array(digest)).toUpperCase();
  const code = hex.slice(0, 12);

  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
}

/*
 * ================================================================
 * QR PAYLOAD
 * ================================================================
 *
 * Conceptual payload only: { version, entropy(base64url) }.
 * No room id/password/signaling info is ever encoded — those are
 * always re-derived locally by each device.
 */

export function buildQrPayload(secretBytes) {
  return JSON.stringify({
    version: DERIVATION_VERSION,
    entropy: bytesToBase64Url(secretBytes),
  });
}

export function parseQrPayload(payloadString) {
  const parsed = JSON.parse(payloadString);

  if (parsed.version !== DERIVATION_VERSION) {
    throw new Error('UNSUPPORTED PAIRING VERSION');
  }

  return base64UrlToBytes(parsed.entropy);
}
