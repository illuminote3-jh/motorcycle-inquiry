/**
 * 설정: 로그인 방식 변경 / 비밀번호 변경 / 자동 잠금 / 초기화
 */
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PasswordConfirmModal from '../components/PasswordConfirmModal';
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

type Props = {
  method: LoginMethod;
  settings: AppSettings;
  onMethodChanged: (m: LoginMethod) => void;
  onSettingsChanged: (s: AppSettings) => void;
  onReset: () => Promise<void>;
  onBack: () => void;
};

type Pending = { kind: 'method'; method: LoginMethod } | { kind: 'reset' } | null;

const LOCK_OPTIONS = [60, 180, 300, 600];

export default function SettingsScreen({ method, settings, onMethodChanged, onSettingsChanged, onReset, onBack }: Props) {
  const [pending, setPending] = useState<Pending>(null);
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
        const ok = await promptBiometric(`${METHOD_LABEL[m]} 등록 확인`);
        if (!ok) return setMethodErr('생체인증이 확인되지 않아 변경을 취소했습니다.');
        await registerBiometricToken(`${METHOD_LABEL[m]} 등록`);
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
    else await onReset();
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

  const chooseLock = async (sec: number) => {
    const next = { ...settings, autoLockSeconds: sec };
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

        <Text style={styles.section}>자동 잠금</Text>
        <Card>
          <Text style={styles.small}>앱을 백그라운드로 보내면 즉시 잠기며, 아래 시간 동안 조작이 없어도 잠깁니다.</Text>
          <View style={styles.chips}>
            {LOCK_OPTIONS.map((sec) => (
              <Pressable
                key={sec}
                onPress={() => chooseLock(sec)}
                style={[styles.chip, settings.autoLockSeconds === sec && styles.chipOn]}
              >
                <Text style={[styles.chipText, settings.autoLockSeconds === sec && { color: '#fff' }]}>{sec / 60}분</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <Text style={styles.section}>데이터</Text>
        <Card>
          <Text style={styles.small}>
            계정 정보는 이 기기 안에서만 AES-256으로 암호화되어 저장되며 외부 서버로 전송되지 않습니다. 기기 변경
            시에는 새 기기에서 다시 등록해야 합니다.
          </Text>
          <Button title="전체 초기화" variant="danger" onPress={confirmReset} />
        </Card>
      </ScrollView>

      <PasswordConfirmModal
        visible={pending !== null}
        title={pending?.kind === 'reset' ? '전체 초기화' : '로그인 방식 변경'}
        onConfirmed={onConfirmed}
        onCancel={() => setPending(null)}
      />
    </SafeAreaView>
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
  chipText: { color: colors.text, fontWeight: '600' },
});
