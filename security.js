import { getMeta, setMeta } from './storage.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ITERATIONS = 600000;
const KEY_INFO = encoder.encode('historic-cabinet-content-v2');
let activeKey = null;

const random = size => crypto.getRandomValues(new Uint8Array(size));
const toArray = bytes => Array.from(bytes);

async function derive(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new Uint8Array(salt), iterations, hash: 'SHA-256' }, base, 256));
  try {
    const legacy = await crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    const content = await crypto.subtle.importKey('raw', bits, { name: 'HKDF' }, false, ['deriveKey']);
    return { legacy, content };
  } finally { bits.fill(0); }
}

async function contentKey(keys, salt) {
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: KEY_INFO }, keys.content, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function seal(keys, value) {
  const salt = random(16);
  const iv = random(12);
  const bytes = encoder.encode(JSON.stringify(value));
  try {
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await contentKey(keys, salt), bytes);
    return { version: 2, salt: toArray(salt), iv: toArray(iv), ciphertext: toArray(new Uint8Array(ciphertext)) };
  } finally { bytes.fill(0); }
}

async function unseal(keys, envelope) {
  if (!Array.isArray(envelope?.iv) || envelope.iv.length !== 12 || !Array.isArray(envelope.ciphertext)) throw new Error('Invalid encrypted record');
  const key = envelope.version === 2
    ? (Array.isArray(envelope.salt) && envelope.salt.length === 16 ? await contentKey(keys, new Uint8Array(envelope.salt)) : null)
    : envelope.version == null ? keys.legacy : null;
  if (!key) throw new Error('Unsupported encrypted record');
  const bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(envelope.iv) }, key, new Uint8Array(envelope.ciphertext)));
  try { return JSON.parse(decoder.decode(bytes)); }
  finally { bytes.fill(0); }
}

export async function hasPassword() { return Boolean(await getMeta('vault')); }

export async function createPassword(password) {
  if (await hasPassword()) throw new Error('Пароль уже создан');
  if (typeof password !== 'string' || password.length < 12) throw new Error('Пароль должен содержать не менее 12 символов');
  const salt = random(16);
  const key = await derive(password, salt, ITERATIONS);
  const verifier = await seal(key, { marker: 'historic-cabinet-v1' });
  await setMeta('vault', { salt: toArray(salt), iterations: ITERATIONS, verifier });
  activeKey = key;
}

export async function unlock(password) {
  const vault = await getMeta('vault');
  if (!vault) throw new Error('Кабинет ещё не создан');
  if (!Array.isArray(vault.salt) || vault.salt.length !== 16 ||
      !vault.salt.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255) ||
      !Number.isInteger(vault.iterations) || vault.iterations < 100000 || vault.iterations > 1000000 ||
      !Array.isArray(vault.verifier?.iv) || vault.verifier.iv.length !== 12 ||
      !Array.isArray(vault.verifier?.ciphertext) || vault.verifier.ciphertext.length < 16) {
    throw new Error('Данные кабинета повреждены');
  }
  const key = await derive(password, vault.salt, vault.iterations);
  try {
    const value = await unseal(key, vault.verifier);
    if (value.marker !== 'historic-cabinet-v1') throw new Error('invalid marker');
  } catch { throw new Error('Неверный пароль'); }
  activeKey = key;
}

export function lock() { activeKey = null; }
export function isUnlocked() { return Boolean(activeKey); }
export async function encryptDocument(document) {
  if (!activeKey) throw new Error('Кабинет заперт');
  return { id: document.id, envelope: await seal(activeKey, document) };
}
export async function decryptDocument(record) {
  if (!activeKey) throw new Error('Кабинет заперт');
  try { return await unseal(activeKey, record.envelope); }
  catch { throw new Error('Не удалось расшифровать документ. Запись повреждена.'); }
}
export async function encryptPrivate(value) { if (!activeKey) throw new Error('Кабинет заперт'); return seal(activeKey,value); }
export async function decryptPrivate(envelope) { if (!activeKey) throw new Error('Кабинет заперт'); return unseal(activeKey,envelope); }
