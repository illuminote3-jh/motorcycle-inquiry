/**
 * 설정: 로그인 방식 변경 / 비밀번호 변경 / 로그인 유지(자동 잠금) / 백업 / 초기화
 */
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PasswordConfirmModal from '../components/PasswordConfirmModal';
import BackupPasswordModal from '../components/BackupPasswordModal';
import { Button, Card, ErrorText, Field, Header, colors, formatRemaining } from '../components/ui';
import {
  AppSettings,
  LoginMethod,
  changePassword,
  clearBiometricToken,
  registerBiometricToken,
  saveSettings,
  setLoginMethod,
  validatePassword,
} from '../security/authStore';
import { METHOD_LABEL, checkBiometric, promptBiometric } from '../security/biometrics';
import { withLockSuppressed } from '../security/lockGuard';
import { BackupError, decryptBackup, mergeSites, pickBackupFile, shareBackup } from '../storage/backup';
import { Site } from '../storage/vault';

type Props = {
  method: LoginMethod;
  settings: AppSettings;
  onMethodChanged: (m: LoginMethod) => void;
  onSettingsChanged: (s: AppSettings) => void;
  onReset: () => Promise<void>;
  sites: Site[];
  onImport: (sites: Site[]) => Promise<void>;
  onBack: () => void;
};

type Pending = { kind: 'method'; method: LoginMethod } | { kind: 'reset' } | { kind: 'export' } | null;

/** 무조작 자동 잠금 (0 = 사용 안 함) */
const AUTO_LOCK_OPTIONS = [180, 600, 1800, 0];
/** 다른 앱 다녀온 뒤 로그인 유지 시간 (0 = 즉시 잠금) */
const BG_LOCK_OPTIONS = [0, 60, 300, 1800];

const PENDING_TITLE = { method: '로그인 방식 변경', reset: '전체 초기화', export: '백업 내보내기' } as const;

export default function SettingsScreen({
  method,
  settings,
  onMethodChanged,
  onSettingsChanged,
  onReset,
  sites,
  onImport,
  onBack,
}: Props) {
  const [pending, setPending] = useState<Pending>(null);
  const [backupMode, setBackupMode] = useState<'export' | 'import' | null>(null);
  const [importContent, setImportContent] = useState<string | null>(null);
  const [backupErr, setBackupErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [methodErr, setMethodErr] = useState<string | null>(null);

  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const chooseMethod = async (m: LoginMethod) => {
    setMsg(null);
    setMethodErr(null);
    if (m === method) return;
    if (m !== 'password') {
      const avail = await checkBiometric(m);
      if (!avail.available) return setMethodErr(avail.message);
    }
    setPending({ kind: 'method', method: m });
  };

  const applyMethod = async (m: LoginMethod) => {
    try {
      if (m === 'password') {
        await clearBiometricToken();
      } else {
        const ok = await withLockSuppressed(() => promptBiometric(`${METHOD_LABEL[m]} 등록 확인`));
        if (!ok) return setMethodErr('생체인증이 확인되지 않아 변경을 취소했습니다.');
        await withLockSuppressed(() => registerBiometricToken(`${METHOD_LABEL[m]} 등록`));
      }
      await setLoginMethod(m);
      onMethodChanged(m);
      setMsg(`로그인 방식이 '${METHOD_LABEL[m]}'(으)로 변경되었습니다.`);
    } catch (e) {
      setMethodErr(`변경 실패: ${(e as Error).message}`);
    }
  };

  const onConfirmed = async () => {
    const p = pending;
    setPending(null);
    if (!p) return;
    if (p.kind === 'method') await applyMethod(p.method);
    else if (p.kind === 'export') setBackupMode('export');
    else await onReset();
  };

  // ───── 백업 ─────
  const startExport = () => {
    setMsg(null);
    setBackupErr(null);
    if (sites.length === 0) return setBackupErr('백업할 사이트가 없습니다.');
    setPending({ kind: 'export' });
  };

  const startImport = async () => {
    setMsg(null);
    setBackupErr(null);
    try {
      const picked = await withLockSuppressed(pickBackupFile);
      if (!picked) return;
      setImportContent(picked.content);
      setBackupMode('import');
    } catch (e) {
      setBackupErr(e instanceof BackupError ? e.message : `파일을 읽지 못했습니다: ${(e as Error).message}`);
    }
  };

  const submitBackup = async (password: string): Promise<string | null> => {
    try {
      if (backupMode === 'export') {
        await withLockSuppressed(() => shareBackup(sites, password));
        setBackupMode(null);
        setMsg(`사이트 ${sites.length}개를 암호화한 백업 파일을 만들었습니다. 안전한 곳(드라이브 등)에 저장하세요.`);
      } else {
        const incoming = await decryptBackup(importContent ?? '', password);
        const { sites: merged, added, replaced } = mergeSites(sites, incoming);
        await onImport(merged);
        setBackupMode(null);
        setImportContent(null);
        setMsg(`복원 완료: 새로 추가 ${added}개, 덮어쓰기 ${replaced}개`);
      }
      return null;
    } catch (e) {
      return e instanceof BackupError ? e.message : `실패: ${(e as Error).message}`;
    }
  };

  const submitPassword = async () => {
    setPwErr(null);
    setMsg(null);
    const err = validatePassword(newPw);
    if (err) return setPwErr(err);
    if (newPw !== newPw2) return setPwErr('새 비밀번호 확인이 일치하지 않습니다.');
    if (newPw === curPw) return setPwErr('현재 비밀번호와 다른 비밀번호를 사용하세요.');
    setPwBusy(true);
    try {
      const res = await changePassword(curPw, newPw);
      if (res.ok) {
        setCurPw('');
        setNewPw('');
        setNewPw2('');
        setMsg('비밀번호가 변경되었습니다.');
      } else if (res.reason === 'locked') {
        setPwErr(`시도 횟수 초과. ${formatRemaining(res.remainingMs)} 후 다시 시도하세요.`);
      } else {
        setPwErr('현재 비밀번호가 올바르지 않습니다.');
      }
    } finally {
      setPwBusy(false);
    }
  };

  const updateSettings = async (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    await saveSettings(next);
    onSettingsChanged(next);
  };

  const confirmReset = () => {
    Alert.alert(
      '전체 초기화',
      '관리자 계정과 저장된 모든 사이트 계정이 영구 삭제됩니다. 계속할까요?',
      [
        { text: '취소', style: 'cancel' },
        { text: '초기화', style: 'destructive', onPress: () => setPending({ kind: 'reset' }) },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Header title="설정" left={{ label: '‹ 뒤로', onPress: onBack }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {msg ? <Text style={styles.msg}>{msg}</Text> : null}

        <Text style={styles.section}>로그인 방식</Text>
        <Card>
          {(['password', 'fingerprint', 'face'] as LoginMethod[]).map((m) => (
            <Pressable key={m} style={styles.radioRow} onPress={() => chooseMethod(m)}>
              <View style={[styles.radio, method === m && styles.radioOn]}>
                {method === m ? <View style={styles.radioDot} /> : null}
              </View>
              <Text style={styles.radioLabel}>{METHOD_LABEL[m]}</Text>
            </Pressable>
          ))}
          <ErrorText>{methodErr}</ErrorText>
          <Text style={styles.small}>
            생체인증을 선택해도 아이디/비밀번호 로그인은 항상 대체 수단으로 사용할 수 있습니다. 기기에 지문·얼굴이
            새로 등록되면 생체 로그인은 자동으로 무효화됩니다.
          </Text>
        </Card>

        <Text style={styles.section}>관리자 비밀번호 변경</Text>
        <Card>
          <Field label="현재 비밀번호" secret value={curPw} onChangeText={setCurPw} />
          <Field label="새 비밀번호" secret value={newPw} onChangeText={setNewPw} hint="영문, 숫자, 특수문자 포함 8자 이상" />
          <Field label="새 비밀번호 확인" secret value={newPw2} onChangeText={setNewPw2} />
          <ErrorText>{pwErr}</ErrorText>
          <Button title="비밀번호 변경" onPress={submitPassword} loading={pwBusy} />
        </Card>

        <Text style={styles.section}>로그인 유지</Text>
        <Card>
          <Text style={styles.label}>다른 앱에 다녀온 뒤 로그인 유지</Text>
          <Text style={styles.small}>
            문자 인증번호 확인 등으로 다른 앱에 다녀와도 이 시간 안에 돌아오면 다시 로그인하지 않습니다.
          </Text>
          <Chips
            options={BG_LOCK_OPTIONS}
            value={settings.backgroundLockSeconds}
            label={(s) => (s === 0 ? '즉시 잠금' : `${s / 60}분`)}
            onChange={(s) => updateSettings({ backgroundLockSeconds: s })}
          />
          <Text style={[styles.label, { marginTop: 18 }]}>조작이 없을 때 자동 잠금</Text>
          <Text style={styles.small}>웹사이트 창 안에서의 조작도 사용 중으로 인정됩니다.</Text>
          <Chips
            options={AUTO_LOCK_OPTIONS}
            value={settings.autoLockSeconds}
            label={(s) => (s === 0 ? '사용 안 함' : `${s / 60}분`)}
            onChange={(s) => updateSettings({ autoLockSeconds: s })}
          />
        </Card>

        <Text style={styles.section}>백업 / 복원</Text>
        <Card>
          <Text style={styles.small}>
            저장된 사이트 계정을 백업 비밀번호로 암호화한 파일로 내보냅니다. 폰을 바꾸거나 앱을 다시 설치할 때
            가져오기로 복원할 수 있습니다. 백업 파일은 비밀번호 없이는 열 수 없습니다.
          </Text>
          <ErrorText>{backupErr}</ErrorText>
          <Button title={`백업 내보내기 (${sites.length}개)`} onPress={startExport} />
          <Button title="백업 가져오기" variant="ghost" onPress={startImport} />
        </Card>

        <Text style={styles.section}>데이터</Text>
        <Card>
          <Text style={styles.small}>
            계정 정보는 이 기기 안에서만 AES-256으로 암호화되어 저장되며 외부 서버로 전송되지 않습니다.
          </Text>
          <Button title="전체 초기화" variant="danger" onPress={confirmReset} />
        </Card>
      </ScrollView>

      <PasswordConfirmModal
        visible={pending !== null}
        title={pending ? PENDING_TITLE[pending.kind] : ''}
        onConfirmed={onConfirmed}
        onCancel={() => setPending(null)}
      />
      <BackupPasswordModal
        visible={backupMode !== null}
        mode={backupMode ?? 'export'}
        onSubmit={submitBackup}
        onCancel={() => {
          setBackupMode(null);
          setImportContent(null);
        }}
      />
    </SafeAreaView>
  );
}

function Chips({
  options,
  value,
  label,
  onChange,
}: {
  options: number[];
  value: number;
  label: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((v) => (
        <Pressable key={v} onPress={() => onChange(v)} style={[styles.chip, value === v && styles.chipOn]}>
          <Text style={[styles.chipText, value === v && { color: '#fff' }]} numberOfLines={1}>
            {label(v)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  section: { fontSize: 13, fontWeight: '700', color: colors.sub, marginBottom: 8, marginLeft: 4 },
  msg: {
    backgroundColor: '#E6F6EC',
    color: colors.success,
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    overflow: 'hidden',
  },
  radioRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  radioLabel: { fontSize: 16, color: colors.text },
  label: { fontSize: 14, fontWeight: '700', color: colors.text },
  small: { fontSize: 12, color: colors.sub, lineHeight: 18, marginTop: 6 },
  chips: { flexDirection: 'row', marginTop: 12, gap: 8 },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '600', fontSize: 13 },
});
