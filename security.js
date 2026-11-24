import { getMeta, setMeta } from './storage.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ITERATIONS = 310000;
let activeKey = null;

const random = size => crypto.getRandomValues(new Uint8Array(size));
const toArray = bytes => Array.from(bytes);

async function derive(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new Uint8Array(salt), iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function seal(key, value) {
  const iv = random(12);
  const bytes = encoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { iv: toArray(iv), ciphertext: toArray(new Uint8Array(ciphertext)) };
}

async function unseal(key, envelope) {
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(envelope.iv) }, key, new Uint8Array(envelope.ciphertext));
  return JSON.parse(decoder.decode(bytes));
}

export async function hasPassword() { return Boolean(await getMeta('vault')); }

export async function createPassword(password) {
  if (await hasPassword()) throw new Error('Пароль уже создан');
  const salt = random(16);
  const key = await derive(password, salt, ITERATIONS);
  const verifier = await seal(key, { marker: 'historic-cabinet-v1' });
  await setMeta('vault', { salt: toArray(salt), iterations: ITERATIONS, verifier });
  activeKey = key;
}

export async function unlock(password) {
  const vault = await getMeta('vault');
  if (!vault) throw new Error('Кабинет ещё не создан');
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
