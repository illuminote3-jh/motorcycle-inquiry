/**
 * 사이트 계정 저장소(Vault)
 * 전체 목록을 JSON으로 직렬화한 뒤 AES-256-GCM으로 암호화하여 저장합니다.
 * 암호화 키는 SecureStore(Keychain/Keystore)에만 있고, 디스크에는 암호문만 남습니다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { decryptString, encryptString } from '../security/crypto';
import { getVaultKey } from '../security/authStore';

export type Site = {
  id: string;
  name: string;
  loginUrl: string;
  username: string;
  password: string;
  /** 자동 인식이 안 되는 사이트용 CSS 선택자(선택) */
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
  /** 입력 후 로그인 버튼 자동 클릭 */
  autoSubmit: boolean;
  createdAt: number;
  updatedAt: number;
};

const VAULT_KEY = 'tls_vault_v1';

export async function loadSites(): Promise<Site[]> {
  const payload = await AsyncStorage.getItem(VAULT_KEY);
  if (!payload) return [];
  const key = await getVaultKey();
  const json = decryptString(key, payload); // 변조 시 예외
  const data = JSON.parse(json) as { sites: Site[] };
  return Array.isArray(data.sites) ? data.sites : [];
}

export async function saveSites(sites: Site[]): Promise<void> {
  const key = await getVaultKey();
  await AsyncStorage.setItem(VAULT_KEY, encryptString(key, JSON.stringify({ sites })));
}

export async function wipeVault(): Promise<void> {
  await AsyncStorage.removeItem(VAULT_KEY);
}

export function newSiteId(): string {
  return Crypto.randomUUID();
}

// RN의 URL 폴리필은 플랫폼별로 불완전할 수 있어 직접 파싱합니다.
const URL_RE = /^([a-z][a-z0-9+.-]*):\/\/([^/?#\s]+)([/?#][^\s]*)?$/i;
const HOST_RE = /^([a-z0-9-]+\.)*[a-z0-9-]+(:\d{1,5})?$/i;

/** https URL만 허용(아이디:비번@ 포함 URL, http, javascript: 등 차단). 정상이면 URL, 아니면 null */
export function normalizeLoginUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  const m = URL_RE.exec(s);
  if (!m) return null;
  const [, scheme, authority, rest] = m;
  if (scheme.toLowerCase() !== 'https') return null;
  if (authority.includes('@') || !HOST_RE.test(authority)) return null;
  return `https://${authority.toLowerCase()}${rest ?? '/'}`;
}

/** URL의 호스트명(포트 제외, 소문자). https가 아니면 빈 문자열 */
export function hostOf(url: string): string {
  const m = URL_RE.exec(url ?? '');
  if (!m || m[1].toLowerCase() !== 'https' || m[2].includes('@')) return '';
  return m[2].replace(/:\d+$/, '').toLowerCase();
}
