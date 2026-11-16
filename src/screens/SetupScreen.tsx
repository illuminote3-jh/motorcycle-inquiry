/**
 * 최초 실행 시 관리자 계정 설정
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, ErrorText, Field, colors } from '../components/ui';
import { createAdmin, validatePassword, validateUserId } from '../security/authStore';

export default function SetupScreen({ onDone }: { onDone: () => void }) {
  const [userId, setUserId] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    const idErr = validateUserId(userId.trim());
    if (idErr) return setError(idErr);
    const pwErr = validatePassword(pw, userId.trim());
    if (pwErr) return setError(pwErr);
    if (pw !== pw2) return setError('비밀번호 확인이 일치하지 않습니다.');
    setBusy(true);
    try {
      await createAdmin(userId.trim(), pw);
      setPw('');
      setPw2('');
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>통합로그인 초기 설정</Text>
          <Text style={styles.desc}>
            앱을 처음 실행했습니다. 앱 잠금에 사용할 관리자 아이디와 비밀번호를 설정하세요.{'\n'}
            비밀번호는 복구할 수 없으니 반드시 기억해 두세요.
          </Text>
          <Card>
            <Field label="관리자 아이디" value={userId} onChangeText={setUserId} placeholder="영문/숫자 4~20자" />
            <Field
              label="비밀번호"
              secret
              value={pw}
              onChangeText={setPw}
              placeholder="8자 이상"
              hint="영문, 숫자, 특수문자를 모두 포함해 8자 이상"
            />
            <Field label="비밀번호 확인" secret value={pw2} onChangeText={setPw2} onSubmitEditing={submit} />
            <ErrorText>{error}</ErrorText>
            <Button title="설정 완료" onPress={submit} loading={busy} />
          </Card>
          <Text style={styles.note}>
            로그인 방식(지문 / 얼굴 인식)은 로그인 후 설정 화면에서 변경할 수 있습니다.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingTop: 40 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 10 },
  desc: { fontSize: 14, color: colors.sub, lineHeight: 21, marginBottom: 20 },
  note: { fontSize: 13, color: colors.sub, textAlign: 'center', marginTop: 6 },
});
