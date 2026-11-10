"""
로컬 테스트 서버 (Vercel CLI 없이 실행용, 배포에는 포함되지 않음)

    python dev_server.py            # 실제 Gmail 발송 (.env.local 필요)
    python dev_server.py --dry-run  # 메일을 보내지 않고 콘솔에 내용만 출력

브라우저에서 http://localhost:8000 접속
"""

import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "api"))

import inquiry  # noqa: E402


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


class DevHandler(inquiry.handler, SimpleHTTPRequestHandler):
    do_GET = SimpleHTTPRequestHandler.do_GET

    def do_POST(self):
        if self.path.split("?")[0] == "/api/inquiry":
            return inquiry.handler.do_POST(self)
        self.send_error(404)


def main() -> None:
    load_env(ROOT / ".env.local")

    if "--dry-run" in sys.argv:
        def fake_send(clean):
            msg = inquiry.build_message(clean, "dry-run@example.com", ["dry-run@example.com"])
            print("\n===== [DRY RUN] 발송될 메일 =====")
            print(f"Subject: {msg['Subject']}\nReply-To: {msg.get('Reply-To')}")
            print(msg.get_body(("plain",)).get_content())
            print("=================================\n")
        inquiry.send_mail = fake_send
        print("DRY RUN 모드: 메일을 실제로 보내지 않습니다.")
    elif not os.environ.get("GMAIL_APP_PASSWORD"):
        print("⚠ .env.local에 GMAIL_USER / GMAIL_APP_PASSWORD가 없습니다. (--dry-run 으로 실행 가능)")

    port = int(os.environ.get("PORT", 8000))
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(DevHandler, directory=str(ROOT)))
    print(f"http://localhost:{port} 에서 실행 중 (Ctrl+C 종료)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
