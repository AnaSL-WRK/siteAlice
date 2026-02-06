// src/admin_overlay.js
// Admin overlays on top of the *existing* public pages.
// - Central login at /admin (stores token in localStorage)
// - Pages enter admin mode ONLY if ?admin=1
// - Drag to reorder, Save/Cancel toolbar
// - Click image to edit metadata
// - "Add new" tile opens upload modal
// - Keep admin=1 across navbar links
// - Auto-scroll while dragging

import { fetchJson, apiBase, resolveUrl } from "./api_client.js";
import { renderBox } from "./gallery_modal.js";

const SS_TOKEN_KEY = "alicenasartes_admin_id_token";
const SS_ON_KEY = "alicenasartes_admin_on";
const STORE = localStorage;

let idToken = STORE.getItem(SS_TOKEN_KEY) || null;
let adminOn = STORE.getItem(SS_ON_KEY) === "1";
let dirty = false;

let dragEl = null;
let dragOriginBoxId = null;

const urlNow = new URL(window.location.href);
const isAdminUrl = urlNow.searchParams.get("admin") === "1";

// Se não está em admin URL, nunca liga overlays
if (!isAdminUrl) {
  adminOn = false;
  STORE.removeItem(SS_ON_KEY);
}

/* ----------------- DOM helpers ----------------- */
function q(sel, root = document) { return root.querySelector(sel); }
function qa(sel, root = document) { return [...root.querySelectorAll(sel)]; }
function getBoxes() { return qa(".box[data-endpoint][data-kind]"); }

function show(el, on) {
  if (!el) return;
  el.style.display = on ? "flex" : "none";
}
function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt || "";
}
function authHeaders(json = true) {
  const h = { Authorization: `Bearer ${idToken}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}
function ensureLoggedIn() {
  if (!idToken) throw new Error("Sessão expirada. Faz login novamente.");
}
function setDirty(on) {
  dirty = !!on;
  const saveBtn = q("#adminBtnSave");
  if (saveBtn) saveBtn.disabled = !dirty;
  setText("adminToolbarStatus", dirty ? "Alterações por guardar" : "");
}

/* ----------------- Navbar keep ?admin=1 ----------------- */
function rewriteLinksForAdmin() {
  if (!isAdminUrl || !adminOn || !idToken) return;

  for (const a of qa("a[href]")) {
    const href = a.getAttribute("href");
    if (!href) continue;

    if (href.startsWith("#")) continue;
    if (href.startsWith("mailto:")) continue;
    if (href.startsWith("http://") || href.startsWith("https://")) continue;
    if (href.toLowerCase().endsWith(".pdf")) continue;

    const u = new URL(href, location.origin);

    // só páginas html ou pastas do próprio site
    const isHtml = u.pathname.endsWith(".html");
    const isFolder = u.pathname.endsWith("/");
    if (!isHtml && !isFolder) continue;

    u.searchParams.set("admin", "1");
    a.setAttribute("href", u.pathname + "?" + u.searchParams.toString() + u.hash);
  }
}

function keepRewritingNavForAWhile() {
  // apanha navbars renderizados/trocados por bootstrap/JS
  rewriteLinksForAdmin();
  setTimeout(rewriteLinksForAdmin, 150);
  setTimeout(rewriteLinksForAdmin, 450);
  setTimeout(rewriteLinksForAdmin, 900);
}

/* ----------------- Auto-enter admin if logged -----------------
   (fallback para quando algum link esquece admin=1) */
function guardAdminParam() {
  if (isAdminUrl) return;
  const token = STORE.getItem(SS_TOKEN_KEY);
  const on = STORE.getItem(SS_ON_KEY) === "1";
  if (!token || !on) return;

  const u = new URL(location.href);
  u.searchParams.set("admin", "1");
  location.replace(u.pathname + "?" + u.searchParams.toString() + u.hash);
}

/* ----------------- UI: toolbar + modals ----------------- */
function ensureToolbar() {
  if (q("#adminToolbar")) return;

  const bar = document.createElement("div");
  bar.id = "adminToolbar";
  bar.className = "admin-toolbar";
  bar.style.display = "none";
  bar.innerHTML = `
    <div class="left">
      <span class="status" style="font-weight:800;">Modo Admin</span>
      <span class="status" id="adminToolbarStatus"></span>
    </div>
    <div class="right">
      <button id="adminBtnSave" class="primary" type="button" disabled>Guardar</button>
      <button id="adminBtnCancel" class="secondary" type="button">Cancelar</button>
      <button id="adminBtnLogout" class="danger" type="button">Sair</button>
    </div>
  `;
  document.body.appendChild(bar);

  q("#adminBtnSave").addEventListener("click", saveAll);
  q("#adminBtnCancel").addEventListener("click", cancelAll);
  q("#adminBtnLogout").addEventListener("click", logout);
}

function ensureModals() {
  // Edit modal
  if (!q("#adminEditModal")) {
    const el = document.createElement("div");
    el.id = "adminEditModal";
    el.className = "a-modal";
    el.innerHTML = `
      <div class="a-content">
        <span class="a-close" data-close="adminEditModal">&times;</span>
        <h3>Editar</h3>

        <img id="aEditPreview" class="a-preview" alt="" />

        <input type="hidden" id="aEditId" />
        <input type="hidden" id="aEditKind" />
        <input type="hidden" id="aEditBoxId" />

        <label>Título</label>
        <input id="aEditTitle" />

        <div class="row">
          <div>
            <label>Ano</label>
            <input id="aEditYear" type="number" />
          </div>
          <div id="aEditCategoryWrap" style="display:none;">
            <label>Categoria (fotografia)</label>
            <select id="aEditCategory">
              <option value="estruturas">Estruturas</option>
              <option value="praia">Praia</option>
              <option value="natureza">Natureza</option>
              <option value="tema_livre">Tema Livre</option>
            </select>
          </div>
        </div>

        <div id="aEditPaintFields" style="display:none;">
          <div class="row">
            <div>
              <label>Técnica</label>
              <input id="aEditTechnique" />
            </div>
            <div>
              <label>Dimensões</label>
              <input id="aEditDimensions" />
            </div>
          </div>
          <div class="row">
            <div>
              <label>Tipo</label>
              <select id="aEditType">
                <option value="pinturas">Pinturas</option>
                <option value="mista">Técnica mista</option>
              </select>
            </div>
            <div></div>
          </div>
        </div>

        <div class="actions">
          <button class="primary" id="aBtnSaveEdit" type="button">Guardar alterações</button>
          <button class="danger" id="aBtnDeleteEdit" type="button">Apagar</button>
          <button class="secondary" type="button" data-close="adminEditModal">Cancelar</button>
        </div>
        <div class="status" id="aEditStatus"></div>
      </div>
    `;
    document.body.appendChild(el);

    q("#aBtnSaveEdit").addEventListener("click", saveEdit);
    q("#aBtnDeleteEdit").addEventListener("click", deleteFromEdit);
  }

  // Upload modal
  if (!q("#adminUploadModal")) {
    const el = document.createElement("div");
    el.id = "adminUploadModal";
    el.className = "a-modal";
    el.innerHTML = `
      <div class="a-content">
        <span class="a-close" data-close="adminUploadModal">&times;</span>
        <h3>Adicionar nova imagem</h3>

        <input type="hidden" id="aUpKind" />
        <input type="hidden" id="aUpCategory" />

        <div class="row">
          <div>
            <label>Coluna</label>
            <select id="aUpCol">
              <option value="1">Coluna 1</option>
              <option value="2">Coluna 2</option>
              <option value="3">Coluna 3</option>
            </select>
          </div>
          <div>
            <label>Ano</label>
            <input id="aUpYear" type="number" />
          </div>
        </div>

        <label>Título</label>
        <input id="aUpTitle" />

        <div id="aUpCategoryWrap" style="display:none;">
          <label>Categoria (fotografia)</label>
          <select id="aUpCategorySelect">
            <option value="estruturas">Estruturas</option>
            <option value="praia">Praia</option>
            <option value="natureza">Natureza</option>
            <option value="tema_livre">Tema Livre</option>
          </select>
        </div>

        <div id="aUpPaintFields" style="display:none;">
          <div class="row">
            <div>
              <label>Técnica</label>
              <input id="aUpTechnique" placeholder="ex: Acrílico sobre tela" />
            </div>
            <div>
              <label>Dimensões</label>
              <input id="aUpDimensions" placeholder="ex: 70 x 50 cm" />
            </div>
          </div>
          <label>Tipo</label>
          <select id="aUpType">
            <option value="pinturas">Pinturas</option>
            <option value="mista">Técnica mista</option>
          </select>
        </div>

        <label>Imagem</label>
        <input id="aUpFile" type="file" accept="image/*" />

        <div class="actions">
          <button class="primary" id="aBtnDoUpload" type="button">Fazer upload</button>
          <button class="secondary" type="button" data-close="adminUploadModal">Cancelar</button>
        </div>
        <div class="status" id="aUpStatus"></div>
      </div>
    `;
    document.body.appendChild(el);

    q("#aBtnDoUpload").addEventListener("click", doUpload);
  }

  // close handlers (delegated)
  document.addEventListener("click", (e) => {
    const close = e.target.closest("[data-close]");
    if (!close) return;
    const id = close.getAttribute("data-close");
    const m = document.getElementById(id);
    if (m) show(m, false);
  });

  for (const m of qa(".a-modal")) {
    m.addEventListener("click", (e) => {
      if (e.target === m) show(m, false);
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    for (const m of qa(".a-modal")) show(m, false);
  });
}

/* ----------------- Auto-scroll while dragging ----------------- */
let __dragScrollRAF = null;
let __dragScrollY = 0;

function startDragAutoScroll() {
  if (__dragScrollRAF) return;
  const step = () => {
    if (!dragEl) { stopDragAutoScroll(); return; }
    if (__dragScrollY !== 0) window.scrollBy({ top: __dragScrollY, left: 0, behavior: "auto" });
    __dragScrollRAF = requestAnimationFrame(step);
  };
  __dragScrollRAF = requestAnimationFrame(step);
}

function stopDragAutoScroll() {
  if (__dragScrollRAF) cancelAnimationFrame(__dragScrollRAF);
  __dragScrollRAF = null;
  __dragScrollY = 0;
}

function updateDragAutoScroll(clientY) {
  const margin = 90;
  const maxSpeed = 24;
  const vh = window.innerHeight;

  if (clientY < margin) {
    const t = (margin - clientY) / margin;
    __dragScrollY = -Math.ceil(maxSpeed * t);
  } else if (clientY > vh - margin) {
    const t = (clientY - (vh - margin)) / margin;
    __dragScrollY = Math.ceil(maxSpeed * t);
  } else {
    __dragScrollY = 0;
  }
}

/* ----------------- Cache + enhance ----------------- */
const boxCache = new Map();

async function refreshCacheAll() {
  const tasks = getBoxes().map(async (box) => {
    const items = await fetchJson(box.dataset.endpoint);
    const map = new Map();
    for (const it of items) map.set(String(it.id), it);
    boxCache.set(box.id, map);
  });
  await Promise.all(tasks);
}

function makeDraggable(el) {
  el.draggable = true;

  el.addEventListener("dragstart", (e) => {
    dragEl = el;
    dragOriginBoxId = el.closest(".box")?.id || null;
    el.classList.add("dragging");

    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", el.dataset.id || "");

    startDragAutoScroll();
  });

  el.addEventListener("drag", (e) => {
    if (typeof e.clientY === "number" && e.clientY > 0) updateDragAutoScroll(e.clientY);
  });

  el.addEventListener("dragend", () => {
    el.classList.remove("dragging");
    dragEl = null;
    dragOriginBoxId = null;
    stopDragAutoScroll();
    setDirty(true);
  });
}

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll(".image-container:not(.dragging):not(.add-tile)")];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

function ensureAddTile(box) {
  const col1 = box.querySelector(".dream");
  if (!col1) return;
  if (col1.querySelector(".add-tile")) return;

  const tile = document.createElement("div");
  tile.className = "image-container add-tile";
  const label = box.dataset.kind === "fotografia"
    ? "➕ Adicionar nova fotografia"
    : "➕ Adicionar nova obra";
  tile.innerHTML = `${label}<br><small>(upload)</small>`;
  tile.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openUploadModalForBox(box);
  });

  col1.insertBefore(tile, col1.firstChild);
}

function ensureEditBadges(box) {
  for (const node of box.querySelectorAll(".image-container")) {
    if (node.classList.contains("add-tile")) continue;
    if (node.querySelector(".admin-badge")) continue;
    const badge = document.createElement("div");
    badge.className = "admin-badge";
    badge.textContent = "✎";
    node.appendChild(badge);
  }
}

function setupDropZones(box) {
  if (box.dataset.adminDropzones === "1") return;
  box.dataset.adminDropzones = "1";

  for (const colEl of box.querySelectorAll(".dream")) {
    colEl.addEventListener("dragover", (e) => {
      if (!dragEl) return;
      if ((colEl.closest(".box")?.id || null) !== dragOriginBoxId) return;

      e.preventDefault();
      updateDragAutoScroll(e.clientY);

      const after = getDragAfterElement(colEl, e.clientY);
      const addTile = colEl.querySelector(".add-tile");
      if (addTile && dragEl === addTile) return;

      if (after == null) colEl.appendChild(dragEl);
      else colEl.insertBefore(dragEl, after);
    });
  }
}

function enhanceBox(box) {
  ensureAddTile(box);
  ensureEditBadges(box);
  setupDropZones(box);

  for (const el of box.querySelectorAll(".image-container")) {
    if (el.classList.contains("add-tile")) continue;
    if (el.dataset.adminDraggable === "1") continue;
    el.dataset.adminDraggable = "1";
    makeDraggable(el);

    const img = el.querySelector("img");
    if (img) {
      img.draggable = false;
      img.addEventListener("dragstart", (ev) => ev.preventDefault());
    }
  }
}

function enhanceBoxWithRetry(box, tries = 0) {
  if (!box.querySelector(".dream")) {
    if (tries < 25) setTimeout(() => enhanceBoxWithRetry(box, tries + 1), 80);
    return;
  }
  enhanceBox(box);
}

function enhanceAllBoxes() {
  for (const box of getBoxes()) enhanceBoxWithRetry(box);
}

/* ----------------- Admin click interception (edit) ----------------- */
let __adminCaptureInstalled = false;

const adminCaptureClickHandler = (e) => {
  if (!isAdminUrl || !adminOn) return;

  const container = e.target.closest(".image-container");
  if (!container) return;
  if (container.classList.contains("add-tile")) return;

  e.preventDefault();
  e.stopPropagation();

  const box = container.closest(".box");
  const id = container.dataset.id;
  if (box && id) openEditModal(box.id, id);
};

function installAdminCapture() {
  if (__adminCaptureInstalled) return;
  document.addEventListener("click", adminCaptureClickHandler, true);
  __adminCaptureInstalled = true;
}

function uninstallAdminCapture() {
  if (!__adminCaptureInstalled) return;
  document.removeEventListener("click", adminCaptureClickHandler, true);
  __adminCaptureInstalled = false;
}

/* ----------------- turn on/off ----------------- */
async function turnOnAdmin() {
  adminOn = true;
  document.body.classList.add("admin-on");
  show(q("#adminToolbar"), true);
  setDirty(false);

  keepRewritingNavForAWhile();

  try {
    await refreshCacheAll();
    enhanceAllBoxes();
  } catch (e) {
    setText("adminToolbarStatus", `Erro: ${e.message}`);
  }
}

async function turnOffAdmin() {
  adminOn = false;
  uninstallAdminCapture();
  setDirty(false);
  document.body.classList.remove("admin-on");
  show(q("#adminToolbar"), false);

  for (const t of qa(".add-tile")) t.remove();
  for (const b of qa(".admin-badge")) b.remove();

  for (const el of qa(".image-container")) {
    el.draggable = false;
    delete el.dataset.adminDraggable;
  }
}

/* ----------------- Save/Cancel reorder ----------------- */
function getOrderStateForBox(box) {
  const cols = [...box.querySelectorAll(".dream")];
  const items = [];
  cols.forEach((colEl, idx) => {
    const ids = [...colEl.querySelectorAll(".image-container")]
      .filter((n) => !n.classList.contains("add-tile"))
      .map((n) => n.dataset.id);
    ids.forEach((id, j) => items.push({ id, col: idx + 1, col_order: j + 1 }));
  });
  return items;
}

async function saveAll() {
  try { ensureLoggedIn(); }
  catch { redirectToCentralLogin(); return; }

  setText("adminToolbarStatus", "A guardar...");

  const fotosItems = [];
  const pinturasItems = [];

  for (const box of getBoxes()) {
    const kind = box.dataset.kind;
    const items = getOrderStateForBox(box);

    if (kind === "fotografia") {
      const category = box.dataset.category || null;
      for (const it of items) fotosItems.push({ ...it, category });
    } else {
      for (const it of items) pinturasItems.push({ ...it, type: kind });
    }
  }

  try {
    if (fotosItems.length) {
      await fetchJson("/api/admin/reorder/fotos", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ items: fotosItems }),
      });
    }
    if (pinturasItems.length) {
      await fetchJson("/api/admin/reorder/pinturas", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ items: pinturasItems }),
      });
    }

    setDirty(false);
    setText("adminToolbarStatus", "Guardado ✅");
    await refreshAllBoxes();
  } catch (e) {
    setText("adminToolbarStatus", `Erro: ${e.message}`);
  }
}

async function cancelAll() {
  setText("adminToolbarStatus", "A reverter...");
  setDirty(false);
  await refreshAllBoxes();
  setText("adminToolbarStatus", "");
}

async function refreshAllBoxes() {
  const tasks = getBoxes().map(async (box) => {
    const overlayMode = box.dataset.overlay || "none";
    await renderBox({ boxId: box.id, endpoint: box.dataset.endpoint, overlayMode });
  });
  await Promise.all(tasks);

  if (adminOn) {
    await refreshCacheAll();
    enhanceAllBoxes();
    keepRewritingNavForAWhile();
  }
}

/* ----------------- Edit modal actions ----------------- */
async function openEditModal(boxId, itemId) {
  ensureModals();

  const box = document.getElementById(boxId);
  if (!box) return;

  const kind = box.dataset.kind;
  let item = boxCache.get(boxId)?.get(String(itemId)) || null;

  if (!item) {
    try {
      const items = await fetchJson(box.dataset.endpoint);
      const map = new Map();
      for (const it of items) map.set(String(it.id), it);
      boxCache.set(boxId, map);
      item = map.get(String(itemId)) || null;
    } catch {}
  }
  if (!item) return;

  q("#aEditBoxId").value = boxId;
  q("#aEditKind").value = kind;
  q("#aEditId").value = String(item.id);
  q("#aEditPreview").src = resolveUrl(item.url);
  q("#aEditTitle").value = item.title || "";
  q("#aEditYear").value = item.year ?? "";

  const catWrap = q("#aEditCategoryWrap");
  const paintWrap = q("#aEditPaintFields");

  if (kind === "fotografia") {
    catWrap.style.display = "";
    paintWrap.style.display = "none";
    q("#aEditCategory").value = item.category || box.dataset.category || "tema_livre";
  } else {
    catWrap.style.display = "none";
    paintWrap.style.display = "";
    q("#aEditTechnique").value = item.technique || "";
    q("#aEditDimensions").value = item.dimensions || "";
    q("#aEditType").value = item.type || kind;
  }

  setText("aEditStatus", "");
  show(q("#adminEditModal"), true);
}

async function saveEdit() {
  try { ensureLoggedIn(); }
  catch { redirectToCentralLogin(); return; }

  const id = q("#aEditId").value;
  const kind = q("#aEditKind").value;
  const boxId = q("#aEditBoxId").value;

  setText("aEditStatus", "A guardar...");

  try {
    if (kind === "fotografia") {
      const payload = {
        title: q("#aEditTitle").value || null,
        year: q("#aEditYear").value ? Number(q("#aEditYear").value) : null,
        category: q("#aEditCategory").value || null,
      };
      await fetchJson(`/api/admin/fotos/${id}`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify(payload),
      });
    } else {
      const payload = {
        title: q("#aEditTitle").value || null,
        year: q("#aEditYear").value ? Number(q("#aEditYear").value) : null,
        technique: q("#aEditTechnique").value || null,
        dimensions: q("#aEditDimensions").value || null,
        type: q("#aEditType").value || kind,
      };
      await fetchJson(`/api/admin/pinturas/${id}`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify(payload),
      });
    }

    show(q("#adminEditModal"), false);
    await refreshAllBoxes();

    const b = document.getElementById(boxId);
    if (b) {
      const items = await fetchJson(b.dataset.endpoint);
      const map = new Map();
      for (const it of items) map.set(String(it.id), it);
      boxCache.set(boxId, map);
    }
  } catch (e) {
    setText("aEditStatus", `Erro: ${e.message}`);
  }
}

async function deleteFromEdit() {
  try { ensureLoggedIn(); }
  catch { redirectToCentralLogin(); return; }

  if (!confirm("Apagar esta imagem?")) return;

  const id = q("#aEditId").value;
  const kind = q("#aEditKind").value;
  setText("aEditStatus", "A apagar...");

  try {
    const endpoint = (kind === "fotografia")
      ? `/api/admin/fotos/${id}`
      : `/api/admin/pinturas/${id}`;

    await fetchJson(endpoint, { method: "DELETE", headers: authHeaders(false) });
    show(q("#adminEditModal"), false);
    await refreshAllBoxes();
  } catch (e) {
    setText("aEditStatus", `Erro: ${e.message}`);
  }
}

/* ----------------- Upload ----------------- */
function openUploadModalForBox(box) {
  ensureModals();
  try { ensureLoggedIn(); }
  catch { redirectToCentralLogin(); return; }

  const kind = box.dataset.kind;
  const category = box.dataset.category || null;

  q("#aUpKind").value = kind;
  q("#aUpCategory").value = category || "";
  q("#aUpTitle").value = "";
  q("#aUpYear").value = "";
  q("#aUpCol").value = "1";
  q("#aUpFile").value = "";

  q("#aUpCategoryWrap").style.display = (kind === "fotografia") ? "" : "none";
  q("#aUpPaintFields").style.display = (kind === "fotografia") ? "none" : "";

  if (kind === "fotografia") {
    q("#aUpCategorySelect").value = category || "tema_livre";
  } else {
    q("#aUpTechnique").value = "";
    q("#aUpDimensions").value = "";
    q("#aUpType").value = kind;
  }

  setText("aUpStatus", "");
  show(q("#adminUploadModal"), true);
}

async function doUpload() {
  try { ensureLoggedIn(); }
  catch { redirectToCentralLogin(); return; }

  setText("aUpStatus", "A enviar...");

  const kind = q("#aUpKind").value;
  const col = q("#aUpCol").value;
  const title = q("#aUpTitle").value;
  const year = q("#aUpYear").value;
  const file = q("#aUpFile").files[0];

  if (!file) { setText("aUpStatus", "Escolhe uma imagem."); return; }

  const fd = new FormData();
  fd.append("col", col);
  if (title && title.trim()) fd.append("title", title.trim());
  if (year) fd.append("year", year);
  fd.append("file", file);

  let endpoint;
  if (kind === "fotografia") {
    const cat = q("#aUpCategorySelect").value;
    fd.append("category", cat);
    endpoint = "/api/admin/upload/foto";
  } else {
    const type = q("#aUpType").value;
    fd.append("type", type);
    fd.append("technique", q("#aUpTechnique").value || (type === "mista" ? "Técnica mista" : ""));
    fd.append("dimensions", q("#aUpDimensions").value || "");
    endpoint = "/api/admin/upload/pintura";
  }

  try {
    const res = await fetch(`${apiBase()}${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
      body: fd,
    });

    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json() : await res.text();

    if (!res.ok) {
      const msg = data?.detail ? data.detail : (typeof data === "string" ? data : `HTTP ${res.status}`);
      setText("aUpStatus", `Erro: ${msg}`);
      return;
    }

    setText("aUpStatus", "Upload concluído ✅");
    show(q("#adminUploadModal"), false);
    await refreshAllBoxes();
  } catch (e) {
    setText("aUpStatus", `Erro: ${e.message}`);
  }
}

/* ----------------- Login redirect + logout ----------------- */
function redirectToCentralLogin() {
  const next = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
  window.location.href = `/admin/?next=${next}`;
}

async function logout() {
  idToken = null;
  STORE.removeItem(SS_TOKEN_KEY);
  STORE.removeItem(SS_ON_KEY);
  await turnOffAdmin();

  const u = new URL(location.href);
  u.searchParams.delete("admin");
  location.href = u.pathname + (u.search ? u.search : "") + u.hash;
}

/* ----------------- Boot ----------------- */
async function init() {
  // fallback: if logged, keep admin=1 even when link forgets it
  guardAdminParam();

  if (!getBoxes().length) return;

  const wantAdmin = new URL(location.href).searchParams.get("admin") === "1";
  if (!wantAdmin) {
    adminOn = false;
    STORE.removeItem(SS_ON_KEY);
    return;
  }

  ensureToolbar();
  ensureModals();

  if (!idToken) {
    redirectToCentralLogin();
    return;
  }

  // validate token permission
  try {
    await fetchJson("/api/admin/me", { method: "GET", headers: authHeaders(false) });
    STORE.setItem(SS_ON_KEY, "1");
    installAdminCapture();
    await turnOnAdmin();
  } catch {
    idToken = null;
    STORE.removeItem(SS_TOKEN_KEY);
    STORE.removeItem(SS_ON_KEY);
    redirectToCentralLogin();
  }
}

document.addEventListener("DOMContentLoaded", init);
