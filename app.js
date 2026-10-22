"use strict";

// ================== CẤU HÌNH ==================
const CONFIG = {
  tenDonVi: "Bệnh viện Đa khoa Hà Trung",
  // Địa chỉ công khai của trang, dùng để in vào QR.
  // Để trống = lấy theo địa chỉ đang mở. Khi có tên miền riêng thì điền vào đây,
  // vd "https://hdsd.benhvien.vn/".
  publicUrl: "",
  maxThuocMotDon: 40,
};
// ==============================================

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) n.append(c);
  return n;
}

// Khoá so khớp mã số — phải giống code_key() trong tools/build_data.py
const codeKey = (s) => String(s).normalize("NFC").toLowerCase().replace(/[\s/\\:*?"<>|]/g, "");
// Bỏ dấu tiếng Việt để tìm kiếm
const fold = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

// ---------- dữ liệu ----------
const DATA = window.THUOC_DATA;
const byId = new Map();
const byCode = new Map(); // codeKey -> [thuốc], ID lớn (mới nhất) trước
const ALL = [];

function loadData() {
  for (const [id, code, name, unit, year, hdsd] of DATA.rows) {
    const d = { id, code, name, unit, year, hdsd, search: fold(name + " " + code) };
    byId.set(id, d);
    ALL.push(d);
    const k = codeKey(code);
    if (!byCode.has(k)) byCode.set(k, []);
    byCode.get(k).push(d);
  }
  for (const list of byCode.values()) list.sort((a, b) => b.id - a.id);
}

function safeHref(url) {
  return /^(https?:\/\/|hdsd\/)/i.test(url) ? url : null;
}

// ================== TRANG BỆNH NHÂN ==================
function showPatient(raw) {
  $("patient").hidden = false;
  document.title = "Hướng dẫn sử dụng thuốc";
  const ids = [...new Set(raw.split(/[^0-9]+/).filter(Boolean).map(Number))].slice(0, CONFIG.maxThuocMotDon);
  const list = $("p-list");

  if (!ids.length) {
    $("p-lead").textContent = "Mã QR không hợp lệ. Vui lòng hỏi lại dược sĩ.";
    return;
  }
  $("p-lead").textContent = `Đơn thuốc của bạn có ${ids.length} thuốc. Chạm vào từng thuốc để xem hướng dẫn sử dụng.`;

  ids.forEach((id, i) => {
    const d = byId.get(id);
    const num = el("span", { class: "num" }, String(i + 1));
    if (!d) {
      list.append(el("li", {}, el("div", { class: "drug card missing" }, num,
        el("div", {}, el("div", { class: "name" }, "Không tìm thấy thông tin thuốc"),
          el("div", { class: "sub" }, `Mã ${id}. Vui lòng hỏi dược sĩ.`)))));
      return;
    }
    const href = safeHref(d.hdsd);
    if (href) {
      list.append(el("li", {}, el("a", { class: "drug card", href, target: "_blank", rel: "noopener" }, num,
        el("div", {}, el("div", { class: "name" }, d.name), el("div", { class: "sub" }, d.unit)),
        el("span", { class: "go" }, "Xem ›"))));
    } else {
      list.append(el("li", {}, el("div", { class: "drug card missing" }, num,
        el("div", {}, el("div", { class: "name" }, d.name),
          el("div", { class: "sub" }, "Chưa có tờ hướng dẫn. Vui lòng hỏi dược sĩ.")))));
    }
  });
}

// ================== TRANG TẠO QR ==================
const state = { pasted: [], manual: [], removed: new Set() };

function selection() {
  const seen = new Set();
  const out = [];
  for (const d of [...state.pasted, ...state.manual]) {
    if (state.removed.has(d.id) || seen.has(d.id)) continue;
    seen.add(d.id);
    out.push(d);
  }
  return out.slice(0, CONFIG.maxThuocMotDon);
}

// Tìm mã thuốc trong văn bản copy từ phần mềm KCB.
// Mỗi dòng lấy tối đa 1 thuốc: ưu tiên ô (tách bằng Tab) khớp đúng mã số;
// không có Tab thì dò từng cụm chữ (thử ghép 2 cụm trước, vì có mã chứa dấu cách).
function parsePrescription(text) {
  const found = [];
  const unknown = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let hit = null;
    for (const cell of line.split("\t")) {
      const list = byCode.get(codeKey(cell));
      if (cell.trim() && list) { hit = list[0]; break; }
    }
    if (!hit) {
      const tokens = line.trim().split(/\s+/);
      for (let i = 0; i < tokens.length && !hit; i++) {
        for (const cand of [tokens[i] + (tokens[i + 1] || ""), tokens[i]]) {
          if (!/[a-z.]/i.test(cand)) continue; // bỏ số thuần (số lượng, liều...)
          const list = byCode.get(codeKey(cand));
          if (list) { hit = list[0]; break; }
        }
      }
    }
    if (hit) found.push(hit);
    else {
      const m = line.match(/\bT\d{2}\.[^\s\t]+/);
      if (m) unknown.push(m[0]);
    }
  }
  return { found, unknown };
}

function onPaste() {
  const text = $("paste").value;
  const { found, unknown } = parsePrescription(text);
  state.pasted = found;
  $("parse-info").textContent = text.trim() ? `Nhận ra ${found.length} thuốc.` : "";
  const w = $("parse-warn");
  w.hidden = !unknown.length;
  w.textContent = unknown.length
    ? `Mã chưa có trong danh mục: ${unknown.join(", ")}. Cần cập nhật danh mục, tạm thời hãy tìm và thêm tay.`
    : "";
  render();
}

function addManual(d) {
  state.removed.delete(d.id);
  if (!state.manual.some((x) => x.id === d.id)) state.manual.push(d);
  render();
}

function removeDrug(d) {
  state.removed.add(d.id);
  state.manual = state.manual.filter((x) => x.id !== d.id);
  render();
}

function resetAll() {
  state.pasted = [];
  state.manual = [];
  state.removed.clear();
  $("paste").value = "";
  $("search").value = "";
  $("parse-info").textContent = "";
  $("parse-warn").hidden = true;
  renderResults();
  render();
  $("paste").focus();
}

function hdsdTag(d) {
  return d.hdsd ? el("span", { class: "tag ok" }, "Có HDSD") : el("span", { class: "tag no" }, "Chưa có HDSD");
}

function renderResults() {
  const q = fold($("search").value.trim());
  const ul = $("results");
  ul.replaceChildren();
  $("results-empty").hidden = true;
  if (!q) return;
  const words = q.split(/\s+/);
  const chosen = new Set(selection().map((d) => d.id));
  const hits = ALL.filter((d) => words.every((w) => d.search.includes(w)))
    .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name, "vi"))
    .slice(0, 50);
  $("results-empty").hidden = hits.length > 0;
  for (const d of hits) {
    const added = chosen.has(d.id);
    const li = el("li", {
      class: "result" + (added ? " added" : ""), tabindex: added ? null : "0",
      onclick: () => !added && addManual(d),
      onkeydown: (e) => { if (!added && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); addManual(d); } },
    },
      el("div", { class: "name" }, d.name),
      el("span", { class: "add" }, added ? "Đã thêm" : "+ Thêm"),
      el("div", { class: "meta" }, el("span", { class: "code" }, d.code), el("span", { class: "tag year" }, d.year ? `Thầu ${d.year}` : "Mã cũ"), hdsdTag(d)),
    );
    ul.append(li);
  }
}

function patientUrl(ids) {
  let base = CONFIG.publicUrl || location.href.split(/[?#]/)[0];
  base = base.replace(/index\.html$/, "");
  return base + "?d=" + ids.join("-");
}

function qrDataUrl(text, scale = 8) {
  const qr = new QRCode(-1, QRErrorCorrectLevel.M);
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const margin = 4; // vùng trắng bắt buộc quanh QR
  const size = (n + margin * 2) * scale;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, size, size);
  g.fillStyle = "#000";
  for (let r = 0; r < n; r++)
    for (let col = 0; col < n; col++)
      if (qr.isDark(r, col)) g.fillRect((col + margin) * scale, (r + margin) * scale, scale, scale);
  return c.toDataURL("image/png");
}

function render() {
  const sel = selection();
  const ul = $("sel");
  ul.replaceChildren();
  for (const d of sel) {
    ul.append(el("li", {},
      el("div", {}, el("div", { class: "name" }, d.name),
        el("div", { class: "meta" }, el("span", { class: "code" }, d.code), hdsdTag(d))),
      el("button", { class: "x", type: "button", title: "Bỏ thuốc này", "aria-label": `Bỏ ${d.name}`, onclick: () => removeDrug(d) }, "×"),
    ));
  }
  $("sel-empty").hidden = sel.length > 0;
  $("sel-count").textContent = sel.length ? `(${sel.length})` : "";

  const missing = sel.filter((d) => !d.hdsd).length;
  $("sel-warn").hidden = !missing;
  $("sel-warn").textContent = missing ? `${missing} thuốc chưa có tờ HDSD. Bệnh nhân sẽ thấy dòng "Chưa có tờ hướng dẫn".` : "";

  renderResults(); // cập nhật nhãn "Đã thêm"
  $("qr-card").hidden = !sel.length;
  if (!sel.length) return;
  const url = patientUrl(sel.map((d) => d.id));
  const png = qrDataUrl(url);
  $("qr-img").src = png;
  $("print-img").src = png;
  $("qr-url").textContent = url;
  $("btn-open").href = url;
  $("print-list").replaceChildren(...sel.map((d) => el("li", {}, d.name)));
}

function downloadQr() {
  const a = el("a", { href: $("qr-img").src, download: `qr-hdsd-${new Date().toISOString().slice(0, 10)}.png` });
  document.body.append(a);
  a.click();
  a.remove();
}

function showStaff() {
  $("staff").hidden = false;
  document.title = "Tạo mã QR hướng dẫn sử dụng thuốc";
  const withHdsd = ALL.filter((d) => d.hdsd).length;
  $("data-info").textContent = `${ALL.length} mã thuốc, ${withHdsd} mã có HDSD, cập nhật ${DATA.version}`;

  if (!CONFIG.publicUrl && !/^https:$/.test(location.protocol)) {
    const w = $("env-warn");
    w.hidden = false;
    w.textContent = "Trang đang mở trên máy (không phải địa chỉ công khai), nên QR tạo ra chỉ để thử: điện thoại bệnh nhân sẽ không mở được.";
  }

  let t;
  $("paste").addEventListener("input", () => { clearTimeout(t); t = setTimeout(onPaste, 120); });
  $("search").addEventListener("input", renderResults);
  $("btn-print").addEventListener("click", () => window.print());
  $("btn-download").addEventListener("click", downloadQr);
  $("btn-reset").addEventListener("click", resetAll);
  render();
  $("paste").focus();
}

// ================== KHỞI ĐỘNG ==================
(function main() {
  document.querySelectorAll("[data-org]").forEach((n) => (n.textContent = CONFIG.tenDonVi));
  if (!DATA || !Array.isArray(DATA.rows)) {
    const f = $("fatal");
    f.hidden = false;
    f.textContent = "Không tải được danh mục thuốc (data/thuoc.js). Vui lòng thử lại sau.";
    return;
  }
  loadData();
  const d = new URLSearchParams(location.search).get("d");
  if (d !== null) showPatient(d);
  else showStaff();
})();
