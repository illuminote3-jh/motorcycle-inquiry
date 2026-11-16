/**
 * 백업 비밀번호 입력 창 (내보내기: 2번 입력 / 가져오기: 1번 입력)
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { Button, ErrorText, Field, colors } from './ui';
import { validateBackupPassword } from '../storage/backup';

type Props = {
  visible: boolean;
  mode: 'export' | 'import';
  /** 실패 시 오류 문구를 반환, 성공 시 null */
  onSubmit: (password: string) => Promise<string | null>;
  onCancel: () => void;
};

export default function BackupPasswordModal({ visible, mode, onSubmit, onCancel }: Props) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 창이 닫히면 입력값 초기화
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (!visible) {
      setPw('');
      setPw2('');
      setError(null);
    }
  }

  const submit = async () => {
    setError(null);
    if (mode === 'export') {
      const err = validateBackupPassword(pw);
      if (err) return setError(err);
      if (pw !== pw2) return setError('비밀번호 확인이 일치하지 않습니다.');
    } else if (!pw) {
      return setError('백업 비밀번호를 입력하세요.');
    }
    setBusy(true);
    try {
      const err = await onSubmit(pw);
      if (err) setError(err);
    } finally {
      setBusy(false);
    }
  };

  const isExport = mode === 'export';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.box}>
          <Text style={styles.title}>{isExport ? '백업 비밀번호 설정' : '백업 비밀번호 입력'}</Text>
          <Text style={styles.desc}>
            {isExport
              ? '백업 파일을 잠글 비밀번호입니다. 복원할 때 꼭 필요하며 잊으면 복구할 수 없습니다.'
              : '백업 파일을 만들 때 설정한 비밀번호를 입력하세요.'}
          </Text>
          <Field
            label="백업 비밀번호"
            secret
            value={pw}
            onChangeText={setPw}
            autoFocus
            hint={isExport ? '영문, 숫자 포함 8자 이상' : undefined}
            onSubmitEditing={isExport ? undefined : submit}
          />
          {isExport ? (
            <Field label="백업 비밀번호 확인" secret value={pw2} onChangeText={setPw2} onSubmitEditing={submit} />
          ) : null}
          <ErrorText>{error}</ErrorText>
          <Button title={isExport ? '백업 파일 만들기' : '복원하기'} onPress={submit} loading={busy} />
          <Button title="취소" variant="ghost" onPress={onCancel} disabled={busy} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  box: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  desc: { fontSize: 13, color: colors.sub, marginTop: 4, marginBottom: 14, lineHeight: 19 },
});
