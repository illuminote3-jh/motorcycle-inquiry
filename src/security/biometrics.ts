/**
 * 기기의 생체인증 지원 여부 확인
 */
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import type { LoginMethod } from './authStore';

export type BiometricAvailability = { available: true } | { available: false; message: string };

export const METHOD_LABEL: Record<LoginMethod, string> = {
  password: '아이디 / 비밀번호',
  fingerprint: '지문 인식',
  face: '얼굴 인식',
};

export async function checkBiometric(method: Exclude<LoginMethod, 'password'>): Promise<BiometricAvailability> {
  if (!(await LocalAuthentication.hasHardwareAsync())) {
    return { available: false, message: '이 기기는 생체인증 하드웨어를 지원하지 않습니다.' };
  }
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const want =
    method === 'fingerprint'
      ? LocalAuthentication.AuthenticationType.FINGERPRINT
      : LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION;
  if (!types.includes(want)) {
    return { available: false, message: `이 기기는 ${METHOD_LABEL[method]}을(를) 지원하지 않습니다.` };
  }
  if (!(await LocalAuthentication.isEnrolledAsync())) {
    return {
      available: false,
      message: `기기 설정에서 ${METHOD_LABEL[method]}을(를) 먼저 등록하세요.`,
    };
  }
  // Android: 카메라 사진만으로 뚫릴 수 있는 약한(Class 2) 얼굴인식은 허용하지 않음
  if (Platform.OS === 'android') {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level < LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG) {
      return {
        available: false,
        message:
          '이 기기의 생체인증은 보안 등급이 낮아(사진으로 우회 가능) 사용할 수 없습니다. 지문 또는 비밀번호 방식을 사용하세요.',
      };
    }
  }
  return { available: true };
}

/** 생체인증 1회 확인 (기기 PIN으로의 우회는 막음 — 대체 수단은 앱 비밀번호) */
export async function promptBiometric(message: string): Promise<boolean> {
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: message,
    cancelLabel: '취소',
    disableDeviceFallback: true,
    fallbackLabel: '',
    biometricsSecurityLevel: 'strong',
  });
  return res.success;
}
