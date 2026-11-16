/**
 * 백업 내보내기 / 가져오기
 * - 사이트 목록을 "백업 비밀번호"로 암호화한 파일(.tlsbackup)로 만듭니다.
 *   키 = PBKDF2-SHA256(백업 비밀번호, 랜덤 솔트) → AES-256-GCM
 * - 기기 고유 키와 무관하므로 새 폰에서도 백업 비밀번호만 알면 복원할 수 있습니다.
 * - 평문 파일은 만들지 않으며, 공유용 임시 파일은 공유 직후 삭제합니다.
 */
import { gcm } from '@noble/ciphers/aes.js';
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes } from '@noble/ciphers/utils.js';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { PBKDF2_ITERATIONS, hashPassword, randomBytes, randomHex } from '../security/crypto';
import { Site } from './vault';

const FORMAT = 'total-login-sys-backup';
const AAD = utf8ToBytes('total-login-sys/backup/v1');
const MIME = 'application/octet-stream';
/** 가져오기 파일 최대 크기 (비정상 파일 방지) */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

type BackupFile = {
  format: typeof FORMAT;
  v: 1;
  createdAt: number;
  count: number;
  kdf: { alg: 'pbkdf2-sha256'; iterations: number; salt: string };
  nonce: string;
  ct: string;
};

export function validateBackupPassword(pw: string): string | null {
  if (pw.length < 8 || pw.length > 64) return '백업 비밀번호는 8~64자로 입력하세요.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return '백업 비밀번호는 영문과 숫자를 모두 포함해야 합니다.';
  return null;
}

async function deriveKey(password: string, saltHex: string, iterations: number): Promise<Uint8Array> {
  return hexToBytes(await hashPassword(password, saltHex, iterations));
}

export async function encryptBackup(sites: Site[], password: string): Promise<string> {
  const salt = randomHex(16);
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const nonce = randomBytes(12);
  const ct = gcm(key, nonce, AAD).encrypt(utf8ToBytes(JSON.stringify({ sites })));
  const file: BackupFile = {
    format: FORMAT,
    v: 1,
    createdAt: Date.now(),
    count: sites.length,
    kdf: { alg: 'pbkdf2-sha256', iterations: PBKDF2_ITERATIONS, salt },
    nonce: bytesToHex(nonce),
    ct: bytesToHex(ct),
  };
  return JSON.stringify(file);
}

export class BackupError extends Error {}

export async function decryptBackup(content: string, password: string): Promise<Site[]> {
  let file: BackupFile;
  try {
    file = JSON.parse(content) as BackupFile;
  } catch {
    throw new BackupError('통합로그인 백업 파일이 아닙니다.');
  }
  if (file?.format !== FORMAT || file.v !== 1 || file.kdf?.alg !== 'pbkdf2-sha256') {
    throw new BackupError('통합로그인 백업 파일이 아니거나 지원하지 않는 버전입니다.');
  }
  const iterations = Number(file.kdf.iterations);
  if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > 2_000_000) {
    throw new BackupError('백업 파일이 손상되었습니다.');
  }
  const key = await deriveKey(password, file.kdf.salt, iterations);
  let json: string;
  try {
    json = bytesToUtf8(gcm(key, hexToBytes(file.nonce), AAD).decrypt(hexToBytes(file.ct)));
  } catch {
    throw new BackupError('백업 비밀번호가 틀렸거나 파일이 손상되었습니다.');
  }
  const data = JSON.parse(json) as { sites?: unknown };
  if (!Array.isArray(data.sites)) throw new BackupError('백업 파일이 손상되었습니다.');
  return data.sites.filter(isSite);
}

function isSite(x: unknown): x is Site {
  const s = x as Site;
  return (
    !!s &&
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    typeof s.loginUrl === 'string' &&
    typeof s.username === 'string' &&
    typeof s.password === 'string'
  );
}

/** 같은 id는 백업 내용으로 교체, 새 항목은 추가. [결과, 추가 수, 교체 수] */
export function mergeSites(current: Site[], incoming: Site[]): { sites: Site[]; added: number; replaced: number } {
  const map = new Map(current.map((s) => [s.id, s]));
  let added = 0;
  let replaced = 0;
  for (const s of incoming) {
    if (map.has(s.id)) replaced += 1;
    else added += 1;
    map.set(s.id, { ...s, autoSubmit: s.autoSubmit !== false });
  }
  return { sites: [...map.values()], added, replaced };
}

/** 암호화된 백업 파일을 만들어 공유 창(드라이브 저장, 메신저 전송 등)을 엽니다. */
export async function shareBackup(sites: Site[], password: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new BackupError('이 기기에서는 파일 공유를 사용할 수 없습니다.');
  const content = await encryptBackup(sites, password);
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const file = new File(Paths.cache, `통합로그인_백업_${stamp}.tlsbackup`);
  try {
    if (file.exists) file.delete();
    await file.write(content);
    await Sharing.shareAsync(file.uri, { mimeType: MIME, dialogTitle: '백업 파일 저장 / 보내기' });
  } finally {
    if (file.exists) file.delete();
  }
}

/** 백업 파일을 선택해 내용을 읽습니다. 취소하면 null */
export async function pickBackupFile(): Promise<{ name: string; content: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  if (asset.size && asset.size > MAX_FILE_BYTES) throw new BackupError('파일이 너무 큽니다. 백업 파일이 맞는지 확인하세요.');
  const file = new File(asset.uri);
  try {
    return { name: asset.name, content: await file.text() };
  } finally {
    if (file.exists) file.delete(); // 캐시에 복사된 사본 제거
  }
}
