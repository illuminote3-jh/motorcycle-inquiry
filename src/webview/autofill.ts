/**
 * WebView 자동 로그인 스크립트 생성
 *
 * 보안 원칙
 * 1) 계정 정보는 페이지 로드 "후" 현재 주소가 등록된 호스트와 정확히 일치할 때만 주입
 *    (피싱 사이트로 리다이렉트되거나 다른 도메인에서는 절대 주입하지 않음)
 * 2) 스크립트 내부에서도 location을 다시 검사 (주입 직전 페이지가 바뀌는 경쟁 상태 대비)
 * 3) 문자열은 JSON.stringify로만 삽입 → 따옴표/스크립트 인젝션 불가
 * 4) https 페이지에서만 동작 (사용자가 해당 사이트에 http 허용을 켠 경우만 http도 허용)
 */
import type { Site } from '../storage/vault';
import { hostOf } from '../storage/vault';

export type AutofillStatus = 'filled' | 'username-only' | 'not-found' | 'submitted';

export function buildAutofillScript(site: Site): string {
  const cfg = {
    host: hostOf(site.loginUrl, !!site.allowInsecure),
    http: !!site.allowInsecure,
    u: site.username,
    p: site.password,
    us: site.usernameSelector || '',
    ps: site.passwordSelector || '',
    ss: site.submitSelector || '',
    auto: site.autoSubmit,
  };
  // JSON은 JS 리터럴로 안전하지만, U+2028/2029와 '</' 는 추가로 이스케이프
  const LS = new RegExp(String.fromCharCode(0x2028), 'g');
  const PS = new RegExp(String.fromCharCode(0x2029), 'g');
  const json = JSON.stringify(cfg)
    .replace(LS, '\\u2028')
    .replace(PS, '\\u2029')
    .replace(/<\//g, '<\\/');

  return `(function () {
  var C = ${json};
  function post(status) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ t: 'tls-autofill', s: status })); } catch (e) {}
  }
  var protoOk = location.protocol === 'https:' || (C.http && location.protocol === 'http:');
  if (!protoOk || location.hostname.toLowerCase() !== C.host) { C = null; return; }
  if (window.__tlsRunning) { C = null; return; }
  window.__tlsRunning = true;

  function q(sel) { if (!sel) return null; try { return document.querySelector(sel); } catch (e) { return null; } }
  function visible(el) {
    if (!el || el.disabled || el.readOnly) return false;
    var st = window.getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none') return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }
  function findPw() {
    var s = q(C.ps); if (s) return s;
    var list = document.querySelectorAll('input[type="password"]');
    for (var i = 0; i < list.length; i++) if (visible(list[i])) return list[i];
    return null;
  }
  function findUser(pw) {
    var s = q(C.us); if (s) return s;
    var scope = (pw && pw.form) || document;
    var inputs = scope.querySelectorAll('input');
    var cands = [];
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      var t = (el.getAttribute('type') || 'text').toLowerCase();
      if (['text', 'email', 'tel', 'number'].indexOf(t) < 0 || !visible(el)) continue;
      if (pw && (el.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_PRECEDING)) continue;
      cands.push(el);
    }
    var re = /user|login|id|email|mail|account|member/i;
    for (var j = 0; j < cands.length; j++) {
      var c = cands[j];
      if ((c.getAttribute('autocomplete') || '').indexOf('username') >= 0) return c;
    }
    for (var k = 0; k < cands.length; k++) {
      var d = cands[k];
      if (re.test((d.name || '') + ' ' + (d.id || '') + ' ' + (d.getAttribute('placeholder') || ''))) return d;
    }
    return cands.length ? cands[cands.length - 1] : null;
  }
  function setVal(el, v) {
    el.focus();
    var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (desc && desc.set) desc.set.call(el, v); else el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  }
  function submit(ref) {
    var b = q(C.ss);
    if (!b && ref && ref.form) b = ref.form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
    if (b) { b.click(); return true; }
    if (ref && ref.form) { if (ref.form.requestSubmit) ref.form.requestSubmit(); else ref.form.submit(); return true; }
    return false;
  }

  var tries = 0, userDone = false;
  function attempt() {
    if (location.hostname.toLowerCase() !== C.host) { C = null; return; }
    var pw = findPw();
    var u = findUser(pw);
    if (pw) {
      if (u && C.u && !userDone) setVal(u, C.u);
      setVal(pw, C.p);
      if (C.auto) {
        setTimeout(function () { var ok = submit(pw); post(ok ? 'submitted' : 'filled'); C = null; }, 350);
      } else { post('filled'); C = null; }
      return;
    }
    // 아이디 → 다음 → 비밀번호 순서의 2단계 로그인 대응
    if (u && C.u && !userDone) {
      setVal(u, C.u); userDone = true; post('username-only');
      if (C.auto) setTimeout(function () { submit(u); }, 350);
    }
    if (++tries < 30) { setTimeout(attempt, 300); return; }
    if (!userDone) post('not-found');
    C = null; window.__tlsRunning = false;
  }
  attempt();
})();
true;`;
}
