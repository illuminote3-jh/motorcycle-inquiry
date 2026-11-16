/**
 * 앱 로그인 화면 (비밀번호 / 지문 / 얼굴)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, ErrorText, Field, colors, formatRemaining } from '../components/ui';
import {
  LoginMethod,
  getRemainingLockMs,
  verifyBiometricToken,
  verifyLogin,
} from '../security/authStore';
import { METHOD_LABEL } from '../security/biometrics';

type Props = { method: LoginMethod; onSuccess: () => void };

export default function LoginScreen({ method, onSuccess }: Props) {
  const isBio = method !== 'password';
  const [mode, setMode] = useState<'bio' | 'password'>(isBio ? 'bio' : 'password');
  const [userId, setUserId] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockMs, setLockMs] = useState(0);
  const autoPrompted = useRef(false);

  // 잠금 카운트다운
  useEffect(() => {
    getRemainingLockMs().then(setLockMs);
  }, []);
  useEffect(() => {
    if (lockMs <= 0) return;
    const t = setInterval(() => setLockMs((v) => Math.max(0, v - 1000)), 1000);
    return () => clearInterval(t);
  }, [lockMs > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const bioLogin = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await verifyBiometricToken(`${METHOD_LABEL[method]}으로 잠금 해제`);
      if (res.ok) return onSuccess();
      if (res.reason === 'locked') {
        setLockMs(res.remainingMs ?? 0);
      } else if (res.reason === 'invalidated') {
        setError(
          '생체 정보가 변경되었거나 인증에 실패했습니다. 아이디/비밀번호로 로그인한 뒤 설정에서 다시 등록하세요.',
        );
        setMode('password');
      }
    } finally {
      setBusy(false);
    }
  }, [method, onSuccess]);

  useEffect(() => {
    if (isBio && !autoPrompted.current) {
      autoPrompted.current = true;
      getRemainingLockMs().then((ms) => {
        if (ms <= 0) bioLogin();
      });
    }
  }, [isBio, bioLogin]);

  const pwLogin = async () => {
    if (!userId.trim() || !pw) return setError('아이디와 비밀번호를 입력하세요.');
    setError(null);
    setBusy(true);
    try {
      const res = await verifyLogin(userId.trim(), pw);
      setPw('');
      if (res.ok) return onSuccess();
      if (res.reason === 'locked') {
        setLockMs(res.remainingMs);
        setError('로그인 시도 횟수를 초과했습니다.');
      } else {
        setError(
          `아이디 또는 비밀번호가 올바르지 않습니다.${
            res.attemptsLeft > 0 ? ` (잠금까지 ${res.attemptsLeft}회 남음)` : ''
          }`,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const locked = lockMs > 0;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.logo}>🔐</Text>
          <Text style={styles.title}>통합로그인</Text>
          <Text style={styles.sub}>로그인 방식: {mode === 'bio' ? METHOD_LABEL[method] : METHOD_LABEL.password}</Text>

          <Card>
            {locked ? (
              <Text style={styles.lock}>
                보안을 위해 잠겨 있습니다.{'\n'}
                {formatRemaining(lockMs)} 후 다시 시도하세요.
              </Text>
            ) : null}

            {mode === 'bio' ? (
              <>
                <Button
                  title={`${METHOD_LABEL[method]}으로 로그인`}
                  onPress={bioLogin}
                  loading={busy}
                  disabled={locked}
                />
                <ErrorText>{error}</ErrorText>
                <Button
                  title="아이디 / 비밀번호로 로그인"
                  variant="ghost"
                  onPress={() => {
                    setError(null);
                    setMode('password');
                  }}
                />
              </>
            ) : (
              <>
                <Field label="아이디" value={userId} onChangeText={setUserId} editable={!locked} />
                <Field
                  label="비밀번호"
                  secret
                  value={pw}
                  onChangeText={setPw}
                  editable={!locked}
                  onSubmitEditing={pwLogin}
                />
                <ErrorText>{error}</ErrorText>
                <Button title="로그인" onPress={pwLogin} loading={busy} disabled={locked} />
                {isBio ? (
                  <Button
                    title={`${METHOD_LABEL[method]}으로 로그인`}
                    variant="ghost"
                    onPress={() => {
                      setError(null);
                      setMode('bio');
                      bioLogin();
                    }}
                    disabled={locked}
                  />
                ) : null}
              </>
            )}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingTop: 60 },
  logo: { fontSize: 52, textAlign: 'center' },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center', color: colors.text, marginTop: 8 },
  sub: { fontSize: 14, color: colors.sub, textAlign: 'center', marginTop: 6, marginBottom: 24 },
  lock: { color: colors.danger, textAlign: 'center', fontSize: 15, lineHeight: 22, marginBottom: 8 },
});
