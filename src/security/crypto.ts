/**
 * 암호화 유틸리티
 * - 관리자 비밀번호: PBKDF2-HMAC-SHA256 + 랜덤 솔트 (평문 저장 X)
 * - 사이트 저장소(Vault): AES-256-GCM (인증 암호화, 위·변조 탐지)
 * - 난수: expo-crypto (OS 암호학적 난수 생성기)
 */
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { gcm } from '@noble/ciphers/aes.js';
import { bytesToHex, hexToBytes, utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils.js';
import * as Crypto from 'expo-crypto';

/** PBKDF2 반복 횟수. 저장 레코드에 함께 기록하므로 추후 상향해도 기존 계정과 호환됩니다. */
export const PBKDF2_ITERATIONS = 100_000;
const VAULT_AAD = utf8ToBytes('total-login-sys/vault/v1');

export function randomBytes(n: number): Uint8Array {
  return Crypto.getRandomBytes(n);
}

export function randomHex(n: number): string {
  return bytesToHex(randomBytes(n));
}

export async function hashPassword(
  password: string,
  saltHex: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<string> {
  const out = await pbkdf2Async(sha256, utf8ToBytes(password), hexToBytes(saltHex), {
    c: iterations,
    dkLen: 32,
  });
  return bytesToHex(out);
}

export function sha256Hex(value: string): string {
  return bytesToHex(sha256(utf8ToBytes(value)));
}

/** 타이밍 공격을 막기 위한 상수 시간 비교 */
export function timingSafeEqual(a: string, b: string): boolean {
  // 비교 대상은 고정 길이 해시이므로 길이 자체는 비밀이 아님
  const x = utf8ToBytes(a);
  const y = utf8ToBytes(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** AES-256-GCM 암호화 → "v1:<nonce hex>:<ciphertext hex>" */
export function encryptString(keyHex: string, plaintext: string): string {
  const key = hexToBytes(keyHex);
  const nonce = randomBytes(12);
  const ct = gcm(key, nonce, VAULT_AAD).encrypt(utf8ToBytes(plaintext));
  return `v1:${bytesToHex(nonce)}:${bytesToHex(ct)}`;
}

/** 복호화. 키가 틀리거나 데이터가 변조되면 예외 발생 */
export function decryptString(keyHex: string, payload: string): string {
  const [version, nonceHex, ctHex] = payload.split(':');
  if (version !== 'v1' || !nonceHex || !ctHex) {
    throw new Error('지원하지 않는 저장소 형식입니다.');
  }
  const pt = gcm(hexToBytes(keyHex), hexToBytes(nonceHex), VAULT_AAD).decrypt(hexToBytes(ctHex));
  return bytesToUtf8(pt);
}
