"""
오토바이 구매 문의 → Gmail 발송 서버리스 함수 (Vercel Python Runtime)

엔드포인트: POST /api/inquiry  (Content-Type: application/json)
필요 환경변수:
    GMAIL_USER          발송용 Gmail 주소
    GMAIL_APP_PASSWORD  Gmail 앱 비밀번호(16자리)
    RECEIVER_EMAIL      문의 수신 주소 (콤마로 여러 개 가능, 생략 시 GMAIL_USER)
    SUPABASE_URL        Supabase 프로젝트 URL (예: https://xxxx.supabase.co)
    SUPABASE_KEY        Supabase publishable(anon) 키 — RLS로 insert만 허용됨

DB 저장과 메일 발송 중 하나라도 성공하면 접수 성공으로 응답한다.
"""

import html
import json
import os
import re
import smtplib
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formataddr
from http.server import BaseHTTPRequestHandler

STORE_NAME = "라이드원 모터스"
KST = timezone(timedelta(hours=9))
MAX_BODY_BYTES = 10_000

PHONE_RE = re.compile(r"^01[016789]-?\d{3,4}-?\d{4}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# (키, 라벨, 필수 여부, 최대 길이, 허용값 or None)
FIELDS = [
    ("name", "이름", True, 30, None),
    ("phone", "연락처", True, 20, None),
    ("email", "이메일", False, 100, None),
    ("model", "관심 차종/모델", True, 100, None),
    ("purchase_type", "구매 유형", True, 10, {"신차", "중고", "미정"}),
    ("budget", "예산", False, 20,
     {"300만원 이하", "300~700만원", "700~1500만원", "1500만원 이상", "미정"}),
    ("payment", "결제 방식", False, 20, {"일시불", "할부", "리스", "상담 후 결정"}),
    ("timing", "구매 희망 시기", False, 20, {"즉시", "1개월 이내", "3개월 이내", "미정"}),
    ("region", "지역", False, 50, None),
    ("message", "문의 내용", False, 1000, None),
]


def _text(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def validate(data: dict):
    """입력값을 검증하고 (정제된 값, 에러 dict)를 반환."""
    clean, errors = {}, {}

    for key, label, required, max_len, choices in FIELDS:
        value = _text(data.get(key))
        if required and not value:
            errors[key] = f"{label}을(를) 입력해주세요."
        elif len(value) > max_len:
            errors[key] = f"{label}은(는) {max_len}자 이하로 입력해주세요."
        elif value and choices is not None and value not in choices:
            errors[key] = f"{label} 값이 올바르지 않습니다."
        clean[key] = value

    if clean["phone"] and "phone" not in errors and not PHONE_RE.match(clean["phone"]):
        errors["phone"] = "휴대폰 번호 형식이 올바르지 않습니다. (예: 010-1234-5678)"
    if clean["email"] and "email" not in errors and not EMAIL_RE.match(clean["email"]):
        errors["email"] = "이메일 형식이 올바르지 않습니다."
    if data.get("agree") is not True:
        errors["agree"] = "개인정보 수집·이용에 동의해주세요."

    return clean, errors


def _one_line(value: str) -> str:
    """메일 헤더용: 줄바꿈 제거 (헤더 인젝션 방지)."""
    return re.sub(r"[\r\n]+", " ", value)


def build_message(clean: dict, sender: str, receivers: list[str]) -> EmailMessage:
    now = datetime.now(KST).strftime("%Y-%m-%d %H:%M (KST)")

    msg = EmailMessage()
    msg["Subject"] = _one_line(
        f"[구매문의] {clean['name']} / {clean['model']} / {clean['purchase_type']}"
    )
    msg["From"] = formataddr((f"{STORE_NAME} 문의알림", sender))
    msg["To"] = ", ".join(receivers)
    if clean["email"]:
        msg["Reply-To"] = _one_line(clean["email"])

    # 텍스트 본문
    lines = [f"{STORE_NAME} 홈페이지로 새 구매 문의가 접수되었습니다.", f"접수 시각: {now}", ""]
    for key, label, *_ in FIELDS:
        lines.append(f"- {label}: {clean[key] or '-'}")
    msg.set_content("\n".join(lines))

    # HTML 본문 (사용자 입력은 모두 escape)
    rows = "".join(
        f"<tr><th style='text-align:left;padding:8px 12px;background:#f4f4f5;"
        f"border:1px solid #e4e4e7;white-space:nowrap'>{html.escape(label)}</th>"
        f"<td style='padding:8px 12px;border:1px solid #e4e4e7;white-space:pre-wrap'>"
        f"{html.escape(clean[key]) or '-'}</td></tr>"
        for key, label, *_ in FIELDS
    )
    phone_digits = re.sub(r"\D", "", clean["phone"])
    msg.add_alternative(
        f"""<div style="font-family:Apple SD Gothic Neo,Malgun Gothic,sans-serif;max-width:640px">
<h2 style="color:#ea580c;margin:0 0 4px">새 구매 문의가 접수되었습니다</h2>
<p style="color:#71717a;margin:0 0 16px">{html.escape(now)}</p>
<table style="border-collapse:collapse;width:100%;font-size:14px">{rows}</table>
<p style="margin-top:16px">
  <a href="tel:{phone_digits}" style="display:inline-block;padding:10px 16px;background:#ea580c;
  color:#fff;border-radius:6px;text-decoration:none">고객에게 전화하기</a>
</p>
<p style="color:#a1a1aa;font-size:12px">고객이 이메일을 입력한 경우, 이 메일에 '답장'하면 고객에게 바로 전송됩니다.</p>
</div>""",
        subtype="html",
    )
    return msg


def send_mail(clean: dict) -> None:
    user = os.environ.get("GMAIL_USER", "").strip()
    password = os.environ.get("GMAIL_APP_PASSWORD", "").replace(" ", "")
    if not user or not password:
        raise RuntimeError("GMAIL_USER / GMAIL_APP_PASSWORD 환경변수가 설정되지 않았습니다.")
    receivers = [
        r.strip() for r in os.environ.get("RECEIVER_EMAIL", user).split(",") if r.strip()
    ]

    msg = build_message(clean, user, receivers)
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as smtp:
        smtp.login(user, password)
        smtp.send_message(msg)


def save_to_db(clean: dict) -> None:
    """Supabase(PostgREST)에 문의 저장. 미설정 시 RuntimeError."""
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_KEY 환경변수가 설정되지 않았습니다.")

    row = {k: (clean[k] or None) for k, *_ in FIELDS}
    req = urllib.request.Request(
        f"{url}/rest/v1/inquiries",
        data=json.dumps(row, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "apikey": key,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",  # anon은 select 권한이 없으므로 결과 반환 안 받음
        },
    )
    if not key.startswith("sb_"):  # 레거시 JWT anon 키는 Authorization 헤더도 필요
        req.add_header("Authorization", f"Bearer {key}")
    with urllib.request.urlopen(req, timeout=10) as res:
        res.read()


def _send_json(h: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    h.send_response(status)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(body)))
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    h.wfile.write(body)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY_BYTES:
            return _send_json(self, 400, {"ok": False, "message": "잘못된 요청입니다."})

        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            data = None
        if not isinstance(data, dict):
            return _send_json(self, 400, {"ok": False, "message": "잘못된 요청 형식입니다."})

        # 허니팟: 사람은 볼 수 없는 필드가 채워져 있으면 봇 → 조용히 성공 응답
        if _text(data.get("website")):
            return _send_json(self, 200, {"ok": True})

        clean, errors = validate(data)
        if errors:
            return _send_json(
                self, 400, {"ok": False, "message": "입력값을 확인해주세요.", "errors": errors}
            )

        saved = sent = False
        try:
            save_to_db(clean)
            saved = True
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:300]
            print(f"[inquiry] db error: {e.code} {detail}", file=sys.stderr)
        except (RuntimeError, OSError) as e:
            print(f"[inquiry] db error: {type(e).__name__}: {e}", file=sys.stderr)

        try:
            send_mail(clean)
            sent = True
        except (RuntimeError, smtplib.SMTPException, OSError) as e:
            print(f"[inquiry] mail error: {type(e).__name__}: {e}", file=sys.stderr)

        if not (saved or sent):
            return _send_json(self, 502, {"ok": False, "message": "접수에 실패했습니다. 잠시 후 다시 시도하거나 전화로 문의해주세요."})

        return _send_json(self, 200, {"ok": True, "message": "문의가 접수되었습니다."})

    def do_GET(self):
        _send_json(self, 405, {"ok": False, "message": "POST만 허용됩니다."})
