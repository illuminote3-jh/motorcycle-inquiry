/**
 * 관리자 계정 / 로그인 방식 / 로그인 시도 제한 관리
 * 모든 값은 SecureStore(iOS Keychain, Android Keystore 암호화)에 저장되며
 * "이 기기에서만, 잠금 해제 상태일 때만" 접근 가능하도록 설정합니다.
 */
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PBKDF2_ITERATIONS,
  hashPassword,
  randomHex,
  sha256Hex,
  timingSafeEqual,
} from './crypto';

export type LoginMethod = 'password' | 'fingerprint' | 'face';

export type AppSettings = {
  /** 무조작 시 자동 잠금(초). 0 = 사용 안 함 */
  autoLockSeconds: number;
  /** 다른 앱으로 전환 후 이 시간(초)이 지나서 돌아오면 잠금. 0 = 즉시 잠금 */
  backgroundLockSeconds: number;
};

type AdminRecord = {
  userIdHash: string;
  salt: string;
  hash: string;
  iterations: number;
  createdAt: number;
};

type LockoutState = { failCount: number; lockUntil: number };

const SS_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
/** 생체인증 전용 키 (requireAuthentication 항목은 별도 서비스 이름 필요) */
const BIO_OPTS = (prompt: string): SecureStore.SecureStoreOptions => ({
  keychainService: 'tls.biometric',
  requireAuthentication: true,
  authenticationPrompt: prompt,
  keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
});

const K = {
  admin: 'tls_admin_v1',
  method: 'tls_login_method',
  lockout: 'tls_lockout',
  settings: 'tls_settings',
  vaultKey: 'tls_vault_key',
  bioToken: 'tls_bio_token',
  bioTokenHash: 'tls_bio_token_hash',
} as const;

/** AsyncStorage는 앱 삭제 시 지워지지만 iOS Keychain은 남기 때문에, 재설치 감지용 마커로 사용 */
const INSTALL_MARKER = 'tls_install_marker';

export const MAX_FREE_ATTEMPTS = 5;
const BASE_LOCK_MS = 30_000;
const MAX_LOCK_MS = 60 * 60_000;

export const DEFAULT_SETTINGS: AppSettings = { autoLockSeconds: 600, backgroundLockSeconds: 300 };

// ───────────────────────── 설치 / 초기화 ─────────────────────────

/** 앱이 재설치되었으면 Keychain에 남은 이전 데이터를 모두 삭제 */
export async function handleFreshInstall(): Promise<void> {
  const marker = await AsyncStorage.getItem(INSTALL_MARKER);
  if (!marker) {
    await wipeSecureData();
    await AsyncStorage.setItem(INSTALL_MARKER, String(Date.now()));
  }
}

export async function wipeSecureData(): Promise<void> {
  for (const key of Object.values(K)) {
    if (key === K.bioToken) continue;
    await SecureStore.deleteItemAsync(key, SS_OPTS).catch(() => {});
  }
  await clearBiometricToken();
}

export async function isAdminConfigured(): Promise<boolean> {
  return (await SecureStore.getItemAsync(K.admin, SS_OPTS)) !== null;
}

// ───────────────────────── 계정 검증 규칙 ─────────────────────────

export function validateUserId(id: string): string | null {
  if (!/^[A-Za-z0-9_.-]{4,20}$/.test(id)) {
    return '아이디는 영문/숫자/._- 조합 4~20자로 입력하세요.';
  }
  return null;
}

export function validatePassword(pw: string, userId?: string): string | null {
  if (pw.length < 8 || pw.length > 64) return '비밀번호는 8~64자로 입력하세요.';
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw) || !/[^A-Za-z0-9]/.test(pw) || classes < 3) {
    return '비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.';
  }
  if (/(.)\1\1\1/.test(pw)) return '같은 문자를 4번 이상 연속 사용할 수 없습니다.';
  if (userId && pw.toLowerCase().includes(userId.toLowerCase())) {
    return '비밀번호에 아이디를 포함할 수 없습니다.';
  }
  return null;
}

// ───────────────────────── 최초 설정 ─────────────────────────

export async function createAdmin(userId: string, password: string): Promise<void> {
  if (await isAdminConfigured()) throw new Error('이미 관리자 계정이 설정되어 있습니다.');
  const salt = randomHex(16);
  const record: AdminRecord = {
    userIdHash: sha256Hex(userId.toLowerCase()),
    salt,
    hash: await hashPassword(password, salt),
    iterations: PBKDF2_ITERATIONS,
    createdAt: Date.now(),
  };
  // 사이트 저장소 암호화 키(256bit) 생성
  await SecureStore.setItemAsync(K.vaultKey, randomHex(32), SS_OPTS);
  await SecureStore.setItemAsync(K.method, 'password', SS_OPTS);
  await SecureStore.setItemAsync(K.settings, JSON.stringify(DEFAULT_SETTINGS), SS_OPTS);
  await SecureStore.setItemAsync(K.admin, JSON.stringify(record), SS_OPTS);
}

// ───────────────────────── 로그인 시도 제한 ─────────────────────────

async function getLockout(): Promise<LockoutState> {
  const raw = await SecureStore.getItemAsync(K.lockout, SS_OPTS);
  if (!raw) return { failCount: 0, lockUntil: 0 };
  try {
    return JSON.parse(raw) as LockoutState;
  } catch {
    return { failCount: 0, lockUntil: 0 };
  }
}

/** 잠겨 있으면 남은 시간(ms), 아니면 0 */
export async function getRemainingLockMs(): Promise<number> {
  const s = await getLockout();
  return Math.max(0, s.lockUntil - Date.now());
}

async function registerFailure(): Promise<LockoutState> {
  const s = await getLockout();
  const failCount = s.failCount + 1;
  let lockUntil = 0;
  if (failCount >= MAX_FREE_ATTEMPTS) {
    // 5회 실패부터 30초, 이후 실패마다 2배 (최대 1시간)
    const exp = failCount - MAX_FREE_ATTEMPTS;
    lockUntil = Date.now() + Math.min(BASE_LOCK_MS * 2 ** exp, MAX_LOCK_MS);
  }
  const next = { failCount, lockUntil };
  await SecureStore.setItemAsync(K.lockout, JSON.stringify(next), SS_OPTS);
  return next;
}

async function resetFailures(): Promise<void> {
  await SecureStore.deleteItemAsync(K.lockout, SS_OPTS);
}

// ───────────────────────── 비밀번호 로그인 ─────────────────────────

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: 'invalid'; attemptsLeft: number }
  | { ok: false; reason: 'locked'; remainingMs: number };

async function getAdmin(): Promise<AdminRecord> {
  const raw = await SecureStore.getItemAsync(K.admin, SS_OPTS);
  if (!raw) throw new Error('관리자 계정이 없습니다.');
  return JSON.parse(raw) as AdminRecord;
}

async function checkCredentials(userId: string | null, password: string): Promise<boolean> {
  const admin = await getAdmin();
  const hash = await hashPassword(password, admin.salt, admin.iterations);
  const pwOk = timingSafeEqual(hash, admin.hash);
  const idOk = userId === null || timingSafeEqual(sha256Hex(userId.toLowerCase()), admin.userIdHash);
  return pwOk && idOk;
}

/**
 * 아이디+비밀번호 확인 (userId가 null이면 비밀번호만 재확인 — 설정 변경 시 사용)
 * 실패 횟수는 로그인/재확인 모두 공통으로 집계합니다.
 */
export async function verifyLogin(userId: string | null, password: string): Promise<LoginResult> {
  const remaining = await getRemainingLockMs();
  if (remaining > 0) return { ok: false, reason: 'locked', remainingMs: remaining };

  if (await checkCredentials(userId, password)) {
    await resetFailures();
    return { ok: true };
  }
  const s = await registerFailure();
  if (s.lockUntil > Date.now()) {
    return { ok: false, reason: 'locked', remainingMs: s.lockUntil - Date.now() };
  }
  return { ok: false, reason: 'invalid', attemptsLeft: Math.max(0, MAX_FREE_ATTEMPTS - s.failCount) };
}

export async function changePassword(current: string, next: string): Promise<LoginResult> {
  const res = await verifyLogin(null, current);
  if (!res.ok) return res;
  const admin = await getAdmin();
  const salt = randomHex(16);
  const updated: AdminRecord = {
    ...admin,
    salt,
    hash: await hashPassword(next, salt),
    iterations: PBKDF2_ITERATIONS,
  };
  await SecureStore.setItemAsync(K.admin, JSON.stringify(updated), SS_OPTS);
  return { ok: true };
}

// ───────────────────────── 로그인 방식 / 설정 ─────────────────────────

export async function getLoginMethod(): Promise<LoginMethod> {
  const v = await SecureStore.getItemAsync(K.method, SS_OPTS);
  return v === 'fingerprint' || v === 'face' ? v : 'password';
}

export async function setLoginMethod(method: LoginMethod): Promise<void> {
  await SecureStore.setItemAsync(K.method, method, SS_OPTS);
}

export async function getSettings(): Promise<AppSettings> {
  const raw = await SecureStore.getItemAsync(K.settings, SS_OPTS);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: AppSettings): Promise<void> {
  await SecureStore.setItemAsync(K.settings, JSON.stringify(s), SS_OPTS);
}

// ───────────────────────── 생체인증 토큰 ─────────────────────────
/*
 * 생체인증 성공 여부를 단순 true/false로 믿지 않고,
 * "생체인증을 통과해야만 꺼낼 수 있는 비밀 토큰"을 OS 보안 저장소에 넣어 둡니다.
 * - iOS: biometryCurrentSet → 지문/얼굴이 새로 등록되면 토큰이 무효화
 * - Android: Keystore setUserAuthenticationRequired → 생체 정보 변경 시 키 무효화
 * 따라서 누군가 기기에 자기 지문을 추가해도 앱은 열리지 않고 비밀번호 로그인을 요구합니다.
 */

export async function registerBiometricToken(prompt: string): Promise<void> {
  const token = randomHex(32);
  await clearBiometricToken();
  await SecureStore.setItemAsync(K.bioToken, token, BIO_OPTS(prompt));
  await SecureStore.setItemAsync(K.bioTokenHash, sha256Hex(token), SS_OPTS);
}

export async function clearBiometricToken(): Promise<void> {
  await SecureStore.deleteItemAsync(K.bioToken, { keychainService: 'tls.biometric' }).catch(() => {});
  await SecureStore.deleteItemAsync(K.bioTokenHash, SS_OPTS).catch(() => {});
}

export type BiometricLoginResult =
  | { ok: true }
  | { ok: false; reason: 'cancel' | 'invalidated' | 'locked'; remainingMs?: number };

export async function verifyBiometricToken(prompt: string): Promise<BiometricLoginResult> {
  const remaining = await getRemainingLockMs();
  if (remaining > 0) return { ok: false, reason: 'locked', remainingMs: remaining };

  const expected = await SecureStore.getItemAsync(K.bioTokenHash, SS_OPTS);
  if (!expected) return { ok: false, reason: 'invalidated' };

  let token: string | null;
  try {
    token = await SecureStore.getItemAsync(K.bioToken, BIO_OPTS(prompt));
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).toLowerCase();
    // 사용자가 취소한 경우와 키가 무효화된 경우를 구분
    if (msg.includes('cancel')) return { ok: false, reason: 'cancel' };
    return { ok: false, reason: 'invalidated' };
  }
  if (token && timingSafeEqual(sha256Hex(token), expected)) {
    await resetFailures();
    return { ok: true };
  }
  return { ok: false, reason: 'invalidated' };
}

// ───────────────────────── Vault 키 ─────────────────────────

export async function getVaultKey(): Promise<string> {
  const key = await SecureStore.getItemAsync(K.vaultKey, SS_OPTS);
  if (!key) throw new Error('암호화 키를 찾을 수 없습니다. 앱 데이터를 초기화해야 합니다.');
  return key;
}
