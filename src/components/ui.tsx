import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

export const colors = {
  bg: '#F4F6FA',
  card: '#FFFFFF',
  primary: '#2F5BEA',
  primaryDark: '#1E3FB0',
  text: '#1B1F2A',
  sub: '#6B7280',
  border: '#D9DEE8',
  danger: '#D93636',
  success: '#1F9D55',
};

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export function Button({ title, onPress, variant = 'primary', disabled, loading, style }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        styles[`btn_${variant}`],
        pressed && { opacity: 0.8 },
        isDisabled && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : colors.primary} />
      ) : (
        <Text style={[styles.btnText, styles[`btnText_${variant}`]]}>{title}</Text>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & { label: string; secret?: boolean; hint?: string };

/** 비밀번호 입력란은 자동완성/자동수정/키보드 학습을 끄고 보기 토글만 제공 */
export function Field({ label, secret, hint, style, ...rest }: FieldProps) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor="#A0A7B4"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          secureTextEntry={secret && !show}
          autoComplete={secret ? 'off' : rest.autoComplete}
          importantForAutofill={secret ? 'no' : rest.importantForAutofill}
          {...rest}
        />
        {secret ? (
          <Pressable onPress={() => setShow((v) => !v)} style={styles.eye} hitSlop={8}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>{show ? '숨김' : '보기'}</Text>
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Header({
  title,
  left,
  right,
}: {
  title: string;
  left?: { label: string; onPress: () => void };
  right?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>
        {left ? (
          <Pressable onPress={left.onPress} hitSlop={10}>
            <Text style={styles.headerAction}>{left.label}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
        {right ? (
          <Pressable onPress={right.onPress} hitSlop={10}>
            <Text style={styles.headerAction}>{right.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function formatRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}초`;
  return `${Math.floor(s / 60)}분 ${s % 60}초`;
}

const styles = StyleSheet.create({
  btn: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    marginTop: 8,
  },
  btn_primary: { backgroundColor: colors.primary },
  btn_secondary: { backgroundColor: '#E8EDFB' },
  btn_danger: { backgroundColor: colors.danger },
  btn_ghost: { backgroundColor: 'transparent' },
  btnText: { fontSize: 16, fontWeight: '700' },
  btnText_primary: { color: '#fff' },
  btnText_secondary: { color: colors.primary },
  btnText_danger: { color: '#fff' },
  btnText_ghost: { color: colors.primary },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#fff',
  },
  eye: { position: 'absolute', right: 14 },
  hint: { fontSize: 12, color: colors.sub, marginTop: 4 },
  error: { color: colors.danger, fontSize: 14, marginVertical: 6 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerSide: { width: 72 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.text },
  headerAction: { color: colors.primary, fontSize: 16, fontWeight: '600' },
});
