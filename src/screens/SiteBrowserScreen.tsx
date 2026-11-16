/**
 * 웹사이트 창 — 열리면서 자동 로그인
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, WebViewMessageEvent, WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { colors } from '../components/ui';
import { Site, hostOf } from '../storage/vault';
import { AutofillStatus, buildAutofillScript } from '../webview/autofill';

/** 한 번 열 때 자동 주입을 시도할 최대 페이지 로드 횟수 (로그인 실패 시 무한 반복 방지) */
const MAX_INJECT_LOADS = 4;

const STATUS_TEXT: Record<AutofillStatus | 'blocked' | 'loading', string> = {
  loading: '로그인 페이지를 여는 중…',
  filled: '아이디/비밀번호를 입력했습니다.',
  submitted: '자동 로그인을 진행했습니다.',
  'username-only': '아이디를 입력했습니다. 비밀번호 단계를 기다리는 중…',
  'not-found': '로그인 입력창을 찾지 못했습니다. 편집 > 고급 설정에서 선택자를 지정하세요.',
  blocked: '보안 연결(https)이 아닌 페이지로의 이동을 차단했습니다.',
};

/** 페이지 안의 터치/스크롤/입력을 앱에 알려 무조작 자동 잠금이 걸리지 않게 함 (최대 5초에 1번) */
const ACTIVITY_SCRIPT = `(function(){
  if (window.__tlsActivity) return; window.__tlsActivity = true;
  var last = 0;
  function ping(){ var n = Date.now(); if (n - last < 5000) return; last = n;
    try { window.ReactNativeWebView.postMessage('{"t":"tls-activity"}'); } catch (e) {} }
  ['touchstart','scroll','keydown','input'].forEach(function(ev){
    window.addEventListener(ev, ping, { passive: true, capture: true }); });
})(); true;`;

type Props = { site: Site; onClose: () => void; onActivity: () => void };

export default function SiteBrowserScreen({ site, onClose, onActivity }: Props) {
  const webRef = useRef<WebView<object>>(null);
  const siteHost = hostOf(site.loginUrl);
  const injectCount = useRef(0);
  const done = useRef(false);
  const [nav, setNav] = useState({ url: site.loginUrl, canGoBack: false, canGoForward: false });
  const [status, setStatus] = useState<keyof typeof STATUS_TEXT>('loading');

  // Android 뒤로가기: 웹 페이지 뒤로 → 더 없으면 창 닫기
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (nav.canGoBack) webRef.current?.goBack();
      else onClose();
      return true;
    });
    return () => sub.remove();
  }, [nav.canGoBack, onClose]);

  const inject = useCallback(
    (url: string, force = false) => {
      // 등록된 도메인과 정확히 일치하는 https 페이지에서만 계정 정보 주입
      if (hostOf(url) !== siteHost || !siteHost) return;
      if (!force && (done.current || injectCount.current >= MAX_INJECT_LOADS)) return;
      injectCount.current += 1;
      webRef.current?.injectJavaScript(buildAutofillScript(site));
    },
    [site, siteHost],
  );

  const onLoadEnd = (e: { nativeEvent: { url: string } }) => {
    onActivity();
    inject(e.nativeEvent.url);
  };

  const onMessage = (e: WebViewMessageEvent) => {
    if (e.nativeEvent.data === '{"t":"tls-activity"}') return onActivity();
    if (hostOf(e.nativeEvent.url) !== siteHost) return; // 다른 출처 메시지 무시
    try {
      const data = JSON.parse(e.nativeEvent.data) as { t?: string; s?: AutofillStatus };
      if (data.t !== 'tls-autofill' || !data.s || !(data.s in STATUS_TEXT)) return;
      if (data.s === 'filled' || data.s === 'submitted') done.current = true;
      setStatus(data.s);
    } catch {
      /* 무시 */
    }
  };

  const onShouldStart = (req: ShouldStartLoadRequest) => {
    const url = req.url ?? '';
    if (url.startsWith('https://') || url === 'about:blank' || url.startsWith('about:srcdoc')) return true;
    if (req.isTopFrame !== false) setStatus('blocked');
    return false; // http, javascript:, intent:, file: 등 차단
  };

  const onNavChange = (n: WebViewNavigation) => {
    onActivity();
    setNav({ url: n.url, canGoBack: n.canGoBack, canGoForward: n.canGoForward });
  };

  const currentHost = hostOf(nav.url);
  const onSiteDomain = currentHost === siteHost;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.top}>
        <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
          <Text style={styles.closeText}>닫기</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {site.name}
          </Text>
          <Text style={[styles.url, !onSiteDomain && { color: '#B7791F' }]} numberOfLines={1}>
            {currentHost ? `🔒 ${currentHost}` : '⚠️ 보안 연결 아님'}
            {!onSiteDomain && currentHost ? ' (등록 도메인 외부)' : ''}
          </Text>
        </View>
      </View>

      <View style={styles.status}>
        <Text style={styles.statusText} numberOfLines={2}>
          {STATUS_TEXT[status]}
        </Text>
      </View>

      {/* WebView 타입 정의가 TS6에서 P=undefined일 때 never가 되어 제네릭을 명시 */}
      <WebView<object>
        ref={webRef}
        source={{ uri: site.loginUrl }}
        originWhitelist={['https://*']}
        onShouldStartLoadWithRequest={onShouldStart}
        onLoadEnd={onLoadEnd}
        injectedJavaScript={ACTIVITY_SCRIPT}
        onMessage={onMessage}
        onNavigationStateChange={onNavChange}
        onContentProcessDidTerminate={() => webRef.current?.reload()}
        onRenderProcessGone={() => webRef.current?.reload()}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="never"
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        javaScriptCanOpenWindowsAutomatically={false}
        setSupportMultipleWindows={false}
        saveFormDataDisabled
        allowsLinkPreview={false}
        webviewDebuggingEnabled={__DEV__}
        startInLoadingState
        style={{ flex: 1 }}
      />

      <View style={styles.toolbar}>
        <ToolBtn label="◀" disabled={!nav.canGoBack} onPress={() => webRef.current?.goBack()} />
        <ToolBtn label="▶" disabled={!nav.canGoForward} onPress={() => webRef.current?.goForward()} />
        <ToolBtn label="⟳" onPress={() => webRef.current?.reload()} />
        <ToolBtn label="다시 입력" disabled={!onSiteDomain} onPress={() => inject(nav.url, true)} />
      </View>
    </SafeAreaView>
  );
}

function ToolBtn({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={styles.toolBtn} hitSlop={6}>
      <Text style={[styles.toolText, disabled && { color: '#C2C8D4' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  closeBtn: { paddingRight: 14 },
  closeText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  url: { fontSize: 12, color: colors.success, marginTop: 2 },
  status: { backgroundColor: '#EEF2FD', paddingHorizontal: 14, paddingVertical: 6 },
  statusText: { fontSize: 12, color: colors.primaryDark },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: 48,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  toolBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  toolText: { fontSize: 17, color: colors.primary, fontWeight: '600' },
});
