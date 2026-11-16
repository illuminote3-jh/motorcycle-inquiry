/**
 * 통합로그인 앱 진입점
 * 화면 흐름: (최초) 관리자 설정 → 로그인 → 웹사이트 관리 ↔ 사이트 편집 / 사이트 창 / 설정
 *
 * 보안 동작
 * - 앱이 백그라운드로 가면 즉시 잠금 + 메모리의 계정 목록 폐기
 * - 일정 시간 조작이 없으면 자동 잠금
 * - 화면 캡처/녹화 차단, 앱 전환 화면(최근 앱 목록)에서 내용 가림
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenCapture from 'expo-screen-capture';

import SetupScreen from './src/screens/SetupScreen';
import LoginScreen from './src/screens/LoginScreen';
import SiteListScreen from './src/screens/SiteListScreen';
import SiteEditScreen from './src/screens/SiteEditScreen';
import SiteBrowserScreen from './src/screens/SiteBrowserScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { colors } from './src/components/ui';
import {
  AppSettings,
  DEFAULT_SETTINGS,
  LoginMethod,
  getLoginMethod,
  getSettings,
  handleFreshInstall,
  isAdminConfigured,
  wipeSecureData,
} from './src/security/authStore';
import { Site, loadSites, saveSites, wipeVault } from './src/storage/vault';

type Phase = 'loading' | 'setup' | 'login' | 'app' | 'error';
type Route =
  | { name: 'list' }
  | { name: 'edit'; site: Site | null }
  | { name: 'browser'; site: Site }
  | { name: 'settings' };

export default function App() {
  ScreenCapture.usePreventScreenCapture();

  const [phase, setPhase] = useState<Phase>('loading');
  const [fatal, setFatal] = useState<string | null>(null);
  const [method, setMethod] = useState<LoginMethod>('password');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [sites, setSites] = useState<Site[]>([]);
  const [route, setRoute] = useState<Route>({ name: 'list' });
  const lastActivity = useRef(Date.now());
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // ───── 초기 구동 ─────
  const boot = useCallback(async () => {
    try {
      await handleFreshInstall();
      if (!(await isAdminConfigured())) {
        await wipeVault();
        setPhase('setup');
        return;
      }
      setMethod(await getLoginMethod());
      setSettings(await getSettings());
      setPhase('login');
    } catch (e) {
      setFatal((e as Error).message);
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    boot();
    ScreenCapture.enableAppSwitcherProtectionAsync(0.9).catch(() => {});
  }, [boot]);

  // ───── 잠금 ─────
  const lock = useCallback(() => {
    if (phaseRef.current !== 'app') return;
    setSites([]); // 복호화된 계정 정보를 메모리에서 제거
    setRoute({ name: 'list' });
    setPhase('login');
  }, []);

  // 백그라운드 전환 시 즉시 잠금
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') lock();
    });
    return () => sub.remove();
  }, [lock]);

  // 무조작 자동 잠금
  useEffect(() => {
    if (phase !== 'app') return;
    lastActivity.current = Date.now();
    const t = setInterval(() => {
      if (Date.now() - lastActivity.current > settings.autoLockSeconds * 1000) lock();
    }, 5000);
    return () => clearInterval(t);
  }, [phase, settings.autoLockSeconds, lock]);

  // Android 뒤로가기 (사이트 창은 자체 처리)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phase === 'app' && route.name !== 'list' && route.name !== 'browser') {
        setRoute({ name: 'list' });
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [phase, route.name]);

  // ───── 로그인 성공 → 저장소 복호화 ─────
  const onLoggedIn = useCallback(async () => {
    try {
      setSites(await loadSites());
      setRoute({ name: 'list' });
      setPhase('app');
    } catch {
      Alert.alert(
        '저장소 오류',
        '저장된 데이터를 복호화할 수 없습니다(손상 또는 변조). 설정의 전체 초기화가 필요할 수 있습니다.',
      );
      setSites([]);
      setPhase('app');
    }
  }, []);

  const persist = async (next: Site[]) => {
    await saveSites(next);
    setSites(next);
  };

  const resetAll = async () => {
    await wipeVault();
    await wipeSecureData();
    setSites([]);
    setMethod('password');
    setSettings(DEFAULT_SETTINGS);
    setRoute({ name: 'list' });
    setPhase('setup');
  };

  // ───── 렌더링 ─────
  let content: React.ReactNode;
  if (phase === 'loading') {
    content = (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  } else if (phase === 'error') {
    content = (
      <View style={styles.center}>
        <Text style={{ color: colors.danger, padding: 24, textAlign: 'center' }}>
          보안 저장소를 사용할 수 없습니다.{'\n'}
          {fatal}
        </Text>
      </View>
    );
  } else if (phase === 'setup') {
    content = <SetupScreen onDone={boot} />;
  } else if (phase === 'login') {
    content = <LoginScreen key={method} method={method} onSuccess={onLoggedIn} />;
  } else if (route.name === 'edit') {
    content = (
      <SiteEditScreen
        site={route.site}
        onCancel={() => setRoute({ name: 'list' })}
        onSave={async (s) => {
          const exists = sites.some((x) => x.id === s.id);
          await persist(exists ? sites.map((x) => (x.id === s.id ? s : x)) : [...sites, s]);
          setRoute({ name: 'list' });
        }}
        onDelete={async (id) => {
          await persist(sites.filter((x) => x.id !== id));
          setRoute({ name: 'list' });
        }}
      />
    );
  } else if (route.name === 'browser') {
    content = <SiteBrowserScreen site={route.site} onClose={() => setRoute({ name: 'list' })} />;
  } else if (route.name === 'settings') {
    content = (
      <SettingsScreen
        method={method}
        settings={settings}
        onMethodChanged={setMethod}
        onSettingsChanged={setSettings}
        onReset={resetAll}
        onBack={() => setRoute({ name: 'list' })}
      />
    );
  } else {
    content = (
      <SiteListScreen
        sites={sites}
        onOpen={(site) => setRoute({ name: 'browser', site })}
        onEdit={(site) => setRoute({ name: 'edit', site })}
        onSettings={() => setRoute({ name: 'settings' })}
        onLock={lock}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {/* 화면 터치를 가로채지 않고 활동 시간만 기록 */}
      <View
        style={{ flex: 1, backgroundColor: colors.bg }}
        onStartShouldSetResponderCapture={() => {
          lastActivity.current = Date.now();
          return false;
        }}
      >
        {content}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
