import argon2 from 'argon2-browser/dist/argon2-bundled.min.js';
import { EncryptedVaultObject, VaultMeta } from '../types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const vaultKeyAad = encoder.encode('wtrack:vault-key:v1');

const defaultKdf: VaultMeta['kdf'] = {
  algorithm: 'argon2id',
  salt: '',
  time: 3,
  mem: 32768,
  parallelism: 1,
  hashLen: 32,
};

export const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

export const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const randomBytes = (length: number) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

const cryptoBytes = (bytes: Uint8Array) => new Uint8Array(bytes);

const importAesKey = (raw: Uint8Array, usages: KeyUsage[], extractable = false) =>
  crypto.subtle.importKey('raw', cryptoBytes(raw), { name: 'AES-GCM' }, extractable, usages);

async function deriveWrappingKey(passphrase: string, kdf: VaultMeta['kdf']) {
  const result = await argon2.hash({
    pass: passphrase,
    salt: base64ToBytes(kdf.salt),
    time: kdf.time,
    mem: kdf.mem,
    parallelism: kdf.parallelism,
    hashLen: kdf.hashLen,
    type: argon2.ArgonType.Argon2id,
  });
  return importAesKey(result.hash, ['encrypt', 'decrypt']);
}

export async function createVaultMeta(passphrase: string) {
  const vaultKeyRaw = randomBytes(32);
  const vaultKey = await importAesKey(vaultKeyRaw, ['encrypt', 'decrypt'], true);
  const kdf: VaultMeta['kdf'] = {
    ...defaultKdf,
    salt: bytesToBase64(randomBytes(16)),
  };
  const wrappingKey = await deriveWrappingKey(passphrase, kdf);
  const nonce = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: vaultKeyAad },
    wrappingKey,
    vaultKeyRaw,
  );

  const meta: VaultMeta = {
    schemaVersion: 1,
    kdf,
    wrappedKey: {
      algorithm: 'AES-GCM',
      nonce: bytesToBase64(nonce),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    },
  };

  return { meta, vaultKey };
}

export async function unlockVaultKey(passphrase: string, meta: VaultMeta) {
  const wrappingKey = await deriveWrappingKey(passphrase, meta.kdf);
  const raw = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: cryptoBytes(base64ToBytes(meta.wrappedKey.nonce)),
      additionalData: vaultKeyAad,
    },
    wrappingKey,
    base64ToBytes(meta.wrappedKey.ciphertext),
  );
  return importAesKey(new Uint8Array(raw), ['encrypt', 'decrypt'], true);
}

export async function rotateVaultMeta(passphrase: string, vaultKey: CryptoKey) {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', vaultKey));
  const kdf: VaultMeta['kdf'] = {
    ...defaultKdf,
    salt: bytesToBase64(randomBytes(16)),
  };
  const wrappingKey = await deriveWrappingKey(passphrase, kdf);
  const nonce = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: vaultKeyAad },
    wrappingKey,
    raw,
  );

  return {
    schemaVersion: 1,
    kdf,
    wrappedKey: {
      algorithm: 'AES-GCM',
      nonce: bytesToBase64(nonce),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    },
  } satisfies VaultMeta;
}

const objectAad = (key: string, role: string, revision: number) =>
  encoder.encode(JSON.stringify({ schemaVersion: 1, key, role, revision }));

export async function encryptVaultObject(
  vaultKey: CryptoKey,
  key: string,
  role: string,
  revision: number,
  payload: unknown,
): Promise<EncryptedVaultObject> {
  const nonce = randomBytes(12);
  const aad = objectAad(key, role, revision);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad },
    vaultKey,
    encoder.encode(JSON.stringify(payload)),
  );

  return {
    key,
    role,
    revision,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    aad: bytesToBase64(aad),
  };
}

export async function decryptVaultObject<T>(vaultKey: CryptoKey, object: EncryptedVaultObject): Promise<T> {
  const aad = objectAad(object.key, object.role, object.revision);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: cryptoBytes(base64ToBytes(object.nonce)),
      additionalData: aad,
    },
    vaultKey,
    base64ToBytes(object.ciphertext),
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}
