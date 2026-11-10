(() => {
  const form = document.getElementById("inquiry-form");
  const btn = document.getElementById("submit-btn");
  const statusEl = document.getElementById("form-status");
  const phoneInput = form.elements.phone;
  const msgInput = form.elements.message;
  const msgCount = document.getElementById("msg-count");

  const PHONE_RE = /^01[016789]-?\d{3,4}-?\d{4}$/;
  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  // 연락처 자동 하이픈
  phoneInput.addEventListener("input", () => {
    const d = phoneInput.value.replace(/\D/g, "").slice(0, 11);
    phoneInput.value =
      d.length < 4 ? d :
      d.length < 8 ? `${d.slice(0, 3)}-${d.slice(3)}` :
      d.length < 11 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` :
      `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  });

  // 글자 수 카운터
  msgInput.addEventListener("input", () => { msgCount.textContent = msgInput.value.length; });

  // 라인업 카드 → 차종 자동 입력
  document.querySelectorAll(".lineup-card").forEach((card) => {
    card.addEventListener("click", () => {
      form.elements.model.value = card.dataset.model;
      clearError("model");
      document.getElementById("inquiry").scrollIntoView({ behavior: "smooth" });
      setTimeout(() => form.elements.name.focus({ preventScroll: true }), 500);
    });
  });

  function setError(name, msg) {
    const el = form.querySelector(`.error[data-for="${name}"]`);
    if (!el) return;
    el.textContent = msg;
    el.closest(".field")?.classList.add("invalid");
  }
  function clearError(name) {
    const el = form.querySelector(`.error[data-for="${name}"]`);
    if (!el) return;
    el.textContent = "";
    el.closest(".field")?.classList.remove("invalid");
  }
  function clearAllErrors() {
    form.querySelectorAll(".error").forEach((el) => {
      el.textContent = "";
      el.closest(".field")?.classList.remove("invalid");
    });
  }

  // 입력 시 해당 필드 에러 제거
  form.addEventListener("input", (e) => { if (e.target.name) clearError(e.target.name); });
  form.addEventListener("change", (e) => { if (e.target.name) clearError(e.target.name); });

  function collect() {
    const f = form.elements;
    return {
      name: f.name.value.trim(),
      phone: f.phone.value.trim(),
      email: f.email.value.trim(),
      model: f.model.value.trim(),
      purchase_type: f.purchase_type.value,
      budget: f.budget.value,
      payment: f.payment.value,
      timing: f.timing.value,
      region: f.region.value.trim(),
      message: f.message.value.trim(),
      agree: f.agree.checked,
      website: f.website.value, // 허니팟
    };
  }

  function validate(d) {
    const errors = {};
    if (!d.name) errors.name = "이름을 입력해주세요.";
    if (!d.phone) errors.phone = "연락처를 입력해주세요.";
    else if (!PHONE_RE.test(d.phone)) errors.phone = "휴대폰 번호 형식이 올바르지 않습니다.";
    if (d.email && !EMAIL_RE.test(d.email)) errors.email = "이메일 형식이 올바르지 않습니다.";
    if (!d.model) errors.model = "관심 차종을 입력해주세요.";
    if (!d.purchase_type) errors.purchase_type = "구매 유형을 선택해주세요.";
    if (!d.agree) errors.agree = "개인정보 수집·이용에 동의해주세요.";
    return errors;
  }

  function showErrors(errors) {
    Object.entries(errors).forEach(([k, v]) => setError(k, v));
    const first = form.querySelector(".field.invalid input, .field.invalid select, .field.invalid textarea");
    if (!first) return;
    first.closest(".field").scrollIntoView({ behavior: "smooth", block: "center" });
    first.focus({ preventScroll: true });
  }

  function setStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = `form-status ${type || ""}`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAllErrors();
    setStatus("");

    const data = collect();
    const errors = validate(data);
    if (Object.keys(errors).length) {
      showErrors(errors);
      const labels = { name: "이름", phone: "연락처", email: "이메일", model: "관심 차종",
        purchase_type: "구매 유형", agree: "개인정보 동의" };
      const missing = Object.keys(errors).map((k) => labels[k] || k).join(", ");
      setStatus(`⚠ 입력 내용을 확인해주세요: ${missing}`, "fail");
      return;
    }

    btn.disabled = true;
    btn.textContent = "전송 중...";

    try {
      const res = await fetch("/api/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));

      if (res.ok && json.ok) {
        form.reset();
        msgCount.textContent = "0";
        setStatus("✅ 상담 신청이 접수되었습니다. 24시간 내 연락드리겠습니다!", "ok");
      } else {
        if (json.errors) showErrors(json.errors);
        setStatus(json.message || "전송에 실패했습니다. 잠시 후 다시 시도해주세요.", "fail");
      }
    } catch {
      setStatus("네트워크 오류가 발생했습니다. 전화(010-0000-0000)로 문의해주세요.", "fail");
    } finally {
      btn.disabled = false;
      btn.textContent = "상담 신청하기";
    }
  });
})();
