# 라이드원 모터스 – 오토바이 구매 문의 랜딩페이지 (테스트)

고객이 상담 폼을 제출하면 Gmail(앱 비밀번호, SMTP)로 문의 메일이 발송됩니다.

## 구조
```
index.html          랜딩페이지
static/             style.css, script.js
api/inquiry.py      POST /api/inquiry → Gmail 발송 (Vercel Python 함수, 표준 라이브러리만 사용)
dev_server.py       로컬 테스트 서버 (배포 제외)
```

## 로컬 테스트
```bash
python dev_server.py --dry-run   # 메일 미발송, 콘솔에 내용 출력
copy .env.local.example .env.local   # 값 채운 뒤
python dev_server.py             # 실제 Gmail 발송
```
http://localhost:8000 접속

## Vercel 배포
1. GitHub에 push → Vercel에서 Import (Framework Preset: **Other**)
2. Settings → Environment Variables 에 등록
   - `GMAIL_USER` / `GMAIL_APP_PASSWORD` / `RECEIVER_EMAIL`
3. Deploy (환경변수 변경 후에는 Redeploy 필요)

## 앱 비밀번호
Google 계정 → 보안 → 2단계 인증 활성화 → 앱 비밀번호 생성(16자리)
