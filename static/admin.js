(() => {
  // publishable 키는 공개용 키입니다. 데이터 접근은 Supabase RLS(관리자 이메일 확인)로 제한됩니다.
  const SUPABASE_URL = "https://nqaavvzpranoirrxqtqp.supabase.co";
  const SUPABASE_KEY = "sb_publishable_FwJFiEf26NflK2K3WL7RYg_R4PwV66d";
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const $ = (id) => document.getElementById(id);
  const loginView = $("login-view");
  const adminView = $("admin-view");
  const dialog = $("detail");
  const dForm = $("detail-form");

  const FIELDS = [
    ["name", "이름"], ["phone", "연락처"], ["email", "이메일"], ["model", "관심 차종/모델"],
    ["purchase_type", "구매 유형"], ["budget", "예산"], ["payment", "결제 방식"],
    ["timing", "구매 희망 시기"], ["region", "지역"], ["message", "문의 내용"],
  ];
  const STATUSES = ["신규", "상담중", "완료", "보류"];

  let rows = [];
  let current = null;

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (iso) => new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  function setStatus(el, msg, type = "") { el.textContent = msg; el.className = `status ${type}`; }

  // ---------- 인증 ----------
  async function route() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      adminView.hidden = true;
      loginView.hidden = false;
      return;
    }
    const { data: isAdmin, error } = await sb.rpc("is_admin");
    if (error || !isAdmin) {
      await sb.auth.signOut();
      loginView.hidden = false;
      adminView.hidden = true;
      setStatus($("login-status"), "관리자 권한이 없는 계정입니다.", "fail");
      return;
    }
    $("user-email").textContent = session.user.email;
    loginView.hidden = true;
    adminView.hidden = false;
    load();
  }

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const btn = $("login-btn");
    btn.disabled = true;
    setStatus($("login-status"), "로그인 중...");
    const { error } = await sb.auth.signInWithPassword({
      email: f.email.value.trim(), password: f.password.value,
    });
    btn.disabled = false;
    if (error) return setStatus($("login-status"), "이메일 또는 비밀번호가 올바르지 않습니다.", "fail");
    setStatus($("login-status"), "");
    f.password.value = "";
    route();
  });

  $("logout-btn").addEventListener("click", async () => {
    await sb.auth.signOut();
    rows = [];
    route();
  });

  // ---------- 목록 ----------
  async function load() {
    setStatus($("list-status"), "불러오는 중...");
    const { data, error } = await sb
      .from("inquiries").select("*").order("created_at", { ascending: false }).limit(1000);
    if (error) return setStatus($("list-status"), `불러오기 실패: ${error.message}`, "fail");
    rows = data;
    setStatus($("list-status"), "");
    render();
  }

  function filtered() {
    const st = $("filter-status").value;
    const q = $("filter-q").value.trim().toLowerCase();
    return rows.filter((r) =>
      (!st || r.status === st) &&
      (!q || [r.name, r.phone, r.model, r.region, r.email].some((v) => (v || "").toLowerCase().includes(q))));
  }

  function render() {
    const today = new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
    const todayCount = rows.filter((r) =>
      new Date(r.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) === today).length;
    $("stats").innerHTML =
      `<li><strong>${rows.length}</strong><span>전체 문의</span></li>` +
      `<li><strong>${todayCount}</strong><span>오늘 접수</span></li>` +
      STATUSES.map((s) => `<li><strong>${rows.filter((r) => r.status === s).length}</strong><span>${s}</span></li>`).join("");

    const list = filtered();
    $("rows").innerHTML = list.length ? list.map((r) => `
      <tr data-id="${r.id}">
        <td>${esc(fmt(r.created_at))}</td>
        <td><span class="badge badge-${esc(r.status)}">${esc(r.status)}</span></td>
        <td>${esc(r.name)}</td>
        <td><a href="tel:${esc(r.phone.replace(/\D/g, ""))}" onclick="event.stopPropagation()">${esc(r.phone)}</a></td>
        <td class="model">${esc(r.model)}</td>
        <td>${esc(r.purchase_type)}</td>
        <td>${esc(r.budget || "-")}</td>
        <td>${esc(r.region || "-")}</td>
        <td>${r.admin_memo ? "📝" : ""}</td>
      </tr>`).join("") : `<tr><td colspan="9" class="empty">문의가 없습니다.</td></tr>`;
  }

  $("rows").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr) openDetail(Number(tr.dataset.id));
  });
  $("filter-status").addEventListener("change", render);
  $("filter-q").addEventListener("input", render);
  $("refresh-btn").addEventListener("click", load);

  // ---------- 상세 ----------
  function openDetail(id) {
    current = rows.find((r) => r.id === id);
    if (!current) return;
    $("d-title").textContent = `#${current.id} ${current.name} 님 문의`;
    $("d-fields").innerHTML =
      `<dt>접수일시</dt><dd>${esc(fmt(current.created_at))}</dd>` +
      FIELDS.map(([k, label]) => `<dt>${label}</dt><dd>${esc(current[k] || "-")}</dd>`).join("");
    dForm.elements.status.value = current.status;
    dForm.elements.admin_memo.value = current.admin_memo || "";
    setStatus($("d-status"), "");
    dialog.showModal();
  }

  $("d-save").addEventListener("click", async () => {
    const patch = {
      status: dForm.elements.status.value,
      admin_memo: dForm.elements.admin_memo.value.trim() || null,
    };
    setStatus($("d-status"), "저장 중...");
    const { data, error } = await sb.from("inquiries").update(patch).eq("id", current.id).select().single();
    if (error) return setStatus($("d-status"), `저장 실패: ${error.message}`, "fail");
    Object.assign(current, data);
    render();
    dialog.close();
  });

  $("d-delete").addEventListener("click", async () => {
    if (!confirm(`#${current.id} ${current.name} 님 문의를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    const { error } = await sb.from("inquiries").delete().eq("id", current.id);
    if (error) return setStatus($("d-status"), `삭제 실패: ${error.message}`, "fail");
    rows = rows.filter((r) => r.id !== current.id);
    render();
    dialog.close();
  });

  // ---------- CSV ----------
  $("csv-btn").addEventListener("click", () => {
    const cols = [["created_at", "접수일시"], ["status", "상태"], ...FIELDS, ["admin_memo", "관리자 메모"]];
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [cols.map(([, l]) => cell(l)).join(",")].concat(
      filtered().map((r) => cols.map(([k]) => cell(k === "created_at" ? fmt(r[k]) : r[k])).join(",")));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `inquiries_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  sb.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") route(); });
  route();
})();
