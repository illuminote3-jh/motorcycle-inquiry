/**
 * 앱이 직접 띄운 시스템 화면(파일 선택, 공유 창, 생체인증 창 등) 때문에
 * 백그라운드로 전환될 때는 잠그지 않도록 하는 장치.
 * 작업이 끝나면(성공/실패 무관) 해제됩니다.
 */
let active = 0;

export function isLockSuppressed(): boolean {
  return active > 0;
}

export async function withLockSuppressed<T>(fn: () => Promise<T>): Promise<T> {
  active += 1;
  try {
    return await fn();
  } finally {
    // 앱으로 복귀하는 'active' 이벤트가 처리된 뒤 해제
    setTimeout(() => {
      active = Math.max(0, active - 1);
    }, 1500);
  }
}
