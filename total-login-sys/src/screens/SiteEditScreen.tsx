/**
 * 사이트 추가 / 편집
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, ErrorText, Field, Header, colors } from '../components/ui';
import { Site, newSiteId, normalizeLoginUrl } from '../storage/vault';

type Props = {
  site: Site | null;
  onSave: (site: Site) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCancel: () => void;
};

export default function SiteEditScreen({ site, onSave, onDelete, onCancel }: Props) {
  const [name, setName] = useState(site?.name ?? '');
  const [url, setUrl] = useState(site?.loginUrl ?? '');
  const [username, setUsername] = useState(site?.username ?? '');
  const [password, setPassword] = useState(site?.password ?? '');
  const [autoSubmit, setAutoSubmit] = useState(site?.autoSubmit ?? true);
  const [allowInsecure, setAllowInsecure] = useState(site?.allowInsecure ?? false);
  const [showAdvanced, setShowAdvanced] = useState(
    !!(site?.usernameSelector || site?.passwordSelector || site?.submitSelector),
  );
  const [userSel, setUserSel] = useState(site?.usernameSelector ?? '');
  const [pwSel, setPwSel] = useState(site?.passwordSelector ?? '');
  const [submitSel, setSubmitSel] = useState(site?.submitSelector ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleInsecure = (on: boolean) => {
    if (!on) return setAllowInsecure(false);
    Alert.alert(
      '안전하지 않은 사이트 허용',
      '보안 연결(https)이 아닌 사이트는 같은 와이파이 등 네트워크에서 아이디/비밀번호가 노출될 수 있습니다. 믿을 수 있는 사이트(회사 내부 시스템 등)에만 켜세요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '허용', style: 'destructive', onPress: () => setAllowInsecure(true) },
      ],
    );
  };

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError('사이트 이름을 입력하세요.');
    const loginUrl = normalizeLoginUrl(url, allowInsecure);
    if (!loginUrl) {
      if (!allowInsecure && normalizeLoginUrl(url, true)) {
        return setError('안전하지 않은(http) 주소입니다. 아래 "안전하지 않은(http) 사이트 허용"을 켜면 저장할 수 있습니다.');
      }
      return setError('올바른 로그인 주소를 입력하세요. (예: https://example.com/login)');
    }
    if (!username) return setError('아이디를 입력하세요.');
    if (!password) return setError('비밀번호를 입력하세요.');
    const now = Date.now();
    setBusy(true);
    try {
      await onSave({
        id: site?.id ?? newSiteId(),
        name: name.trim().slice(0, 50),
        loginUrl,
        username,
        password,
        usernameSelector: userSel.trim() || undefined,
        passwordSelector: pwSel.trim() || undefined,
        submitSelector: submitSel.trim() || undefined,
        autoSubmit,
        allowInsecure: allowInsecure || undefined,
        createdAt: site?.createdAt ?? now,
        updatedAt: now,
      });
    } catch (e) {
      setError(`저장 실패: ${(e as Error).message}`);
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    if (!site) return;
    Alert.alert('사이트 삭제', `'${site.name}'의 저장된 계정 정보를 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => onDelete(site.id) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Header title={site ? '사이트 편집' : '사이트 추가'} left={{ label: '취소', onPress: onCancel }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Card>
            <Field label="사이트 이름" value={name} onChangeText={setName} placeholder="예: 회사 그룹웨어" autoCapitalize="sentences" />
            <Field
              label="로그인 페이지 주소"
              value={url}
              onChangeText={setUrl}
              placeholder="https://example.com/login"
              keyboardType="url"
              hint="로그인 입력창이 있는 페이지의 실제 주소를 입력하세요. 이 주소의 도메인에서만 계정이 입력됩니다."
            />
            <Field label="아이디" value={username} onChangeText={setUsername} />
            <Field label="비밀번호" secret value={password} onChangeText={setPassword} />
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>입력 후 자동으로 로그인 버튼 누르기</Text>
                <Text style={styles.switchHint}>끄면 아이디/비밀번호만 채워 줍니다.</Text>
              </View>
              <Switch value={autoSubmit} onValueChange={setAutoSubmit} />
            </View>
            <View style={[styles.switchRow, { marginTop: 14 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>안전하지 않은(http) 사이트 허용</Text>
                <Text style={styles.switchHint}>http:// 주소이거나 로그인 중 http 페이지로 이동하는 사이트만 켜세요.</Text>
              </View>
              <Switch value={allowInsecure} onValueChange={toggleInsecure} />
            </View>
          </Card>

          <Button
            title={showAdvanced ? '고급 설정 닫기' : '고급 설정 (자동 입력이 안 될 때)'}
            variant="ghost"
            onPress={() => setShowAdvanced((v) => !v)}
          />
          {showAdvanced ? (
            <Card>
              <Text style={styles.advDesc}>
                대부분의 사이트는 입력창을 자동으로 찾습니다. 찾지 못하는 사이트만 CSS 선택자를 입력하세요.
              </Text>
              <Field label="아이디 입력창 선택자" value={userSel} onChangeText={setUserSel} placeholder="#user_id" />
              <Field label="비밀번호 입력창 선택자" value={pwSel} onChangeText={setPwSel} placeholder="#user_pw" />
              <Field label="로그인 버튼 선택자" value={submitSel} onChangeText={setSubmitSel} placeholder="button.login" />
            </Card>
          ) : null}

          <ErrorText>{error}</ErrorText>
          <Button title="저장" onPress={save} loading={busy} />
          {site ? <Button title="사이트 삭제" variant="danger" onPress={confirmDelete} style={{ marginTop: 14 }} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  switchLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  switchHint: { fontSize: 12, color: colors.sub, marginTop: 2 },
  advDesc: { fontSize: 13, color: colors.sub, marginBottom: 12, lineHeight: 19 },
});
