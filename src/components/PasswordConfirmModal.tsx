/**
 * 중요한 설정 변경 전 관리자 비밀번호 재확인
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { Button, ErrorText, Field, colors, formatRemaining } from './ui';
import { verifyLogin } from '../security/authStore';

type Props = {
  visible: boolean;
  title: string;
  onConfirmed: () => void;
  onCancel: () => void;
};

export default function PasswordConfirmModal({ visible, title, onConfirmed, onCancel }: Props) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 창이 닫히면 입력값/오류 초기화 (effect 대신 렌더 중 상태 조정)
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (!visible) {
      setPw('');
      setError(null);
    }
  }

  const confirm = async () => {
    if (!pw) return setError('비밀번호를 입력하세요.');
    setBusy(true);
    try {
      const res = await verifyLogin(null, pw);
      setPw('');
      if (res.ok) return onConfirmed();
      setError(
        res.reason === 'locked'
          ? `시도 횟수 초과. ${formatRemaining(res.remainingMs)} 후 다시 시도하세요.`
          : `비밀번호가 올바르지 않습니다. (잠금까지 ${res.attemptsLeft}회)`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.box}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.desc}>계속하려면 관리자 비밀번호를 입력하세요.</Text>
          <Field label="관리자 비밀번호" secret value={pw} onChangeText={setPw} autoFocus onSubmitEditing={confirm} />
          <ErrorText>{error}</ErrorText>
          <Button title="확인" onPress={confirm} loading={busy} />
          <Button title="취소" variant="ghost" onPress={onCancel} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  box: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  desc: { fontSize: 13, color: colors.sub, marginTop: 4, marginBottom: 14 },
});
