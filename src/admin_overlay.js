// src/admin_overlay.js
// Admin overlays on top of the *existing* public pages.
// - Login with Google (GSI) -> toggles admin mode.
// - Drag to reorder (within each gallery box), then Save/Cancel on a top toolbar.
// - Click an image to edit metadata.
// - "Add new" tile opens an upload modal.

import { fetchJson, apiBase, resolveUrl } from './api_client.js';
import { renderBox } from './gallery_modal.js';

const GOOGLE_CLIENT_ID = window.__GOOGLE_CLIENT_ID__ || '592470068306-l60g26dm0ria5k2hdeitsn2dk83f6kdr.apps.googleusercontent.com';

const SS_TOKEN_KEY = 'alicenasartes_admin_id_token';
const SS_ON_KEY = 'alicenasartes_admin_on';

let idToken = sessionStorage.getItem(SS_TOKEN_KEY) || null;
let adminOn = sessionStorage.getItem(SS_ON_KEY) === '1';
let dirty = false;

let dragEl = null;
let dragOriginBoxId = null;

// Cache items per box (boxId -> Map<id,item>)
const boxCache = new Map();

/* ----------------- DOM helpers ----------------- */
function q(sel, root = document) { return root.querySelector(sel); }
function qa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function getBoxes() {
  return qa('.box[data-endpoint][data-kind]');
}

function show(el, on) {
  if (!el) return;
  el.style.display = on ? 'flex' : 'none';
}

function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt || '';
}

function authHeaders(json = true) {
  const h = { Authorization: `Bearer ${idToken}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

function ensureLoggedIn() {
  if (!idToken) throw new Error('Faz login com Google primeiro.');
}

function setDirty(on) {
  dirty = !!on;
  const saveBtn = q('#adminBtnSave');
  if (saveBtn) saveBtn.disabled = !dirty;
  setText('adminToolbarStatus', dirty ? 'Alterações por guardar' : '');
}

/* ----------------- UI: toolbar + FAB + modals ----------------- */

function ensureToolbar() {
  if (q('#adminToolbar')) return;

  const bar = document.createElement('div');
  bar.id = 'adminToolbar';
  bar.className = 'admin-toolbar';
  bar.style.display = 'none';
  bar.innerHTML = `
    <div class="left">
      <span class="status" style="font-weight:800;">Modo Admin</span>
      <span class="status" id="adminToolbarStatus"></span>
    </div>
    <div class="right">
      <button id="adminBtnSave" class="primary" type="button" disabled>Guardar</button>
      <button id="adminBtnCancel" class="secondary" type="button">Cancelar</button>
      <button id="adminBtnSwitch" class="secondary" type="button">Trocar conta</button>
      <button id="adminBtnLogout" class="danger" type="button">Sair</button>
    </div>
  `;
  document.body.appendChild(bar);

  q('#adminBtnSave').addEventListener('click', saveAll);
  q('#adminBtnCancel').addEventListener('click', cancelAll);
  q('#adminBtnLogout').addEventListener('click', logout);
  q('#adminBtnSwitch').addEventListener('click', switchAccount);
}

function ensureModals() {
  if (!q('#adminLoginModal')) {
    const el = document.createElement('div');
    el.id = 'adminLoginModal';
    el.className = 'a-modal';
    el.innerHTML = `
      <div class="a-content">
        <span class="a-close" data-close="adminLoginModal">&times;</span>
        <h3>Modo Admin</h3>
        <div style="color: navy; font-size: 13px; opacity:.85; margin-bottom: 10px;">
          Faz login com a conta autorizada.
        </div>
        <div id="adminGbtn"></div>
        <div class="status" id="adminLoginStatus"></div>
        <div class="actions">
          <button class="secondary" type="button" data-close="adminLoginModal">Fechar</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
  }

  if (!q('#adminEditModal')) {
    const el = document.createElement('div');
    el.id = 'adminEditModal';
    el.className = 'a-modal';
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

    q('#aBtnSaveEdit').addEventListener('click', saveEdit);
    q('#aBtnDeleteEdit').addEventListener('click', deleteFromEdit);
  }

  if (!q('#adminUploadModal')) {
    const el = document.createElement('div');
    el.id = 'adminUploadModal';
    el.className = 'a-modal';
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

    q('#aBtnDoUpload').addEventListener('click', doUpload);
  }

  // close handlers (delegated)
  document.addEventListener('click', (e) => {
    const close = e.target.closest('[data-close]');
    if (!close) return;
    const id = close.getAttribute('data-close');
    const m = document.getElementById(id);
    if (m) show(m, false);
  });

  // close modal on backdrop click
  for (const m of qa('.a-modal')) {
    m.addEventListener('click', (e) => {
      if (e.target === m) show(m, false);
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const m of qa('.a-modal')) show(m, false);
  });
}

/* ----------------- Google Login (GSI) ----------------- */
let gsiInitialized = false;

function waitForGsi(timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (window.google?.accounts?.id) return resolve();
      if (Date.now() - t0 > timeoutMs) return reject(new Error('Google login não carregou. Confirma se incluíste o script GSI.'));
      setTimeout(tick, 50);
    };
    tick();
  });
}

async function initGsi() {
  if (gsiInitialized) return;
  await waitForGsi();
  gsiInitialized = true;

  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    auto_select: false,
    callback: async (response) => {
      const token = response.credential;

      // Verify permission server-side (email allowlist) before enabling overlays
      try {
        idToken = token;
        await fetchJson('/api/admin/me', { method: 'GET', headers: authHeaders(false) });
      } catch (e) {
        idToken = null;
        sessionStorage.removeItem(SS_TOKEN_KEY);
        sessionStorage.removeItem(SS_ON_KEY);
        setText('adminLoginStatus', `Sem permissões: ${e.message}`);
        return;
      }

      sessionStorage.setItem(SS_TOKEN_KEY, token);
      sessionStorage.setItem(SS_ON_KEY, '1');
      setText('adminLoginStatus', 'Autenticada ✅');
      show(q('#adminLoginModal'), false);
      await turnOnAdmin();
    },
  });

  const btnMount = q('#adminGbtn');
  if (btnMount) {
    window.google.accounts.id.renderButton(btnMount, { theme: 'outline', size: 'large' });
  }
}

async function openLogin() {
  ensureModals();
  setText('adminLoginStatus', '');
  show(q('#adminLoginModal'), true);
  try {
    await initGsi();
  } catch (e) {
    setText('adminLoginStatus', `Erro: ${e.message}`);
  }
}

function switchAccount() {
  try {
    window.google.accounts.id.disableAutoSelect();
    window.google.accounts.id.prompt();
  } catch {
    // ignore
  }
}

function logout() {
  idToken = null;
  sessionStorage.removeItem(SS_TOKEN_KEY);
  sessionStorage.removeItem(SS_ON_KEY);
  turnOffAdmin();
  try { window.google.accounts.id.disableAutoSelect(); } catch {}
}

/* ----------------- Admin mode: cache + enhance ----------------- */
async function refreshCacheAll() {
  const tasks = getBoxes().map(async (box) => {
    const endpoint = box.dataset.endpoint;
    const items = await fetchJson(endpoint);
    const map = new Map();
    for (const it of items) map.set(String(it.id), it);
    boxCache.set(box.id, map);
  });
  await Promise.all(tasks);
}

function makeDraggable(el) {
  el.draggable = true;

  el.addEventListener('dragstart', (e) => {
    dragEl = el;
    dragOriginBoxId = el.closest('.box')?.id || null;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    dragEl = null;
    dragOriginBoxId = null;
    setDirty(true);
  });
}

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll('.image-container:not(.dragging):not(.add-tile)')];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

function ensureAddTile(box) {
  const col1 = box.querySelector('.dream');
  if (!col1) return;

  if (col1.querySelector('.add-tile')) return;

  const tile = document.createElement('div');
  tile.className = 'image-container add-tile';
  const label = box.dataset.kind === 'fotografia'
    ? '➕ Adicionar nova fotografia'
    : '➕ Adicionar nova obra';
  tile.innerHTML = `${label}<br><small>(upload)</small>`;
  tile.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openUploadModalForBox(box);
  });

  // tile always first
  col1.insertBefore(tile, col1.firstChild);
}

function ensureEditBadges(box) {
  for (const node of box.querySelectorAll('.image-container')) {
    if (node.classList.contains('add-tile')) continue;
    if (node.querySelector('.admin-badge')) continue;
    const badge = document.createElement('div');
    badge.className = 'admin-badge';
    badge.textContent = '✎';
    node.appendChild(badge);
  }
}

function setupDropZones(box) {
  if (box.dataset.adminDropzones === '1') return;
  box.dataset.adminDropzones = '1';

  for (const colEl of box.querySelectorAll('.dream')) {
    colEl.addEventListener('dragover', (e) => {
      if (!dragEl) return;
      if ((colEl.closest('.box')?.id || null) !== dragOriginBoxId) return; // prevent cross-box moves

      e.preventDefault();
      const after = getDragAfterElement(colEl, e.clientY);
      const addTile = colEl.querySelector('.add-tile');
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

  for (const el of box.querySelectorAll('.image-container')) {
    if (el.classList.contains('add-tile')) continue;
    if (el.dataset.adminDraggable === '1') continue;
    el.dataset.adminDraggable = '1';
    makeDraggable(el);
  }
}

function enhanceBoxWithRetry(box, tries = 0) {
  // renderBox populates columns asynchronously; wait for .dream
  if (!box.querySelector('.dream')) {
    if (tries < 25) setTimeout(() => enhanceBoxWithRetry(box, tries + 1), 80);
    return;
  }
  enhanceBox(box);
}

function enhanceAllBoxes() {
  for (const box of getBoxes()) enhanceBoxWithRetry(box);
}

async function turnOnAdmin() {
  adminOn = true;
  document.body.classList.add('admin-on');
  show(q('#adminToolbar'), true);
  setDirty(false);

  try {
    await refreshCacheAll();
    enhanceAllBoxes();
  } catch (e) {
    // token might be expired -> show login again
    setText('adminToolbarStatus', `Erro: ${e.message}`);
  }
}

async function turnOffAdmin() {
  adminOn = false;
  setDirty(false);
  document.body.classList.remove('admin-on');
  show(q('#adminToolbar'), false);

  // cleanup: remove add tiles & badges (keep public page clean)
  for (const t of qa('.add-tile')) t.remove();
  for (const b of qa('.admin-badge')) b.remove();

  // disable dragging on public mode
  for (const el of qa('.image-container')) {
    el.draggable = false;
    delete el.dataset.adminDraggable;
  }
}

/* ----------------- Click interception: open edit instead of view modal ----------------- */
document.addEventListener('click', (e) => {
  if (!adminOn) return;
  const container = e.target.closest('.image-container');
  if (!container) return;
  if (container.classList.contains('add-tile')) return;

  // In admin mode, click = edit (stop universal modal)
  e.preventDefault();
  e.stopPropagation();

  const box = container.closest('.box');
  const id = container.dataset.id;
  if (box && id) openEditModal(box.id, id);
}, true); // capture

/* ----------------- Save / Cancel order ----------------- */
function getOrderStateForBox(box) {
  const cols = [...box.querySelectorAll('.dream')];
  const items = [];
  cols.forEach((colEl, idx) => {
    const ids = [...colEl.querySelectorAll('.image-container')]
      .filter(n => !n.classList.contains('add-tile'))
      .map(n => n.dataset.id);
    ids.forEach((id, j) => items.push({ id, col: idx + 1, col_order: j + 1 }));
  });
  return items;
}

async function saveAll() {
  try {
    ensureLoggedIn();
  } catch (e) {
    await openLogin();
    return;
  }

  setText('adminToolbarStatus', 'A guardar...');

  const fotosItems = [];
  const pinturasItems = [];

  for (const box of getBoxes()) {
    const kind = box.dataset.kind;
    const items = getOrderStateForBox(box);
    if (kind === 'fotografia') {
      const category = box.dataset.category || null;
      for (const it of items) fotosItems.push({ ...it, category });
    } else {
      // pinturas | mista
      for (const it of items) pinturasItems.push({ ...it, type: kind });
    }
  }

  try {
    if (fotosItems.length) {
      await fetchJson('/api/admin/reorder/fotos', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ items: fotosItems }),
      });
    }

    if (pinturasItems.length) {
      await fetchJson('/api/admin/reorder/pinturas', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ items: pinturasItems }),
      });
    }

    setDirty(false);
    setText('adminToolbarStatus', 'Guardado ✅');
    await refreshAllBoxes();
  } catch (e) {
    setText('adminToolbarStatus', `Erro: ${e.message}`);
  }
}

async function cancelAll() {
  setText('adminToolbarStatus', 'A reverter...');
  setDirty(false);
  await refreshAllBoxes();
  setText('adminToolbarStatus', '');
}

async function refreshAllBoxes() {
  const tasks = getBoxes().map(async (box) => {
    const overlayMode = box.dataset.overlay || 'none';
    await renderBox({ boxId: box.id, endpoint: box.dataset.endpoint, overlayMode });
  });
  await Promise.all(tasks);
  if (adminOn) {
    await refreshCacheAll();
    enhanceAllBoxes();
  }
}

/* ----------------- Edit modal ----------------- */
async function openEditModal(boxId, itemId) {
  ensureModals();

  const box = document.getElementById(boxId);
  if (!box) return;

  const kind = box.dataset.kind;
  let item = boxCache.get(boxId)?.get(String(itemId)) || null;

  // fallback: reload cache for this box if missing
  if (!item) {
    try {
      const items = await fetchJson(box.dataset.endpoint);
      const map = new Map();
      for (const it of items) map.set(String(it.id), it);
      boxCache.set(boxId, map);
      item = map.get(String(itemId)) || null;
    } catch {
      // ignore
    }
  }

  if (!item) return;

  q('#aEditBoxId').value = boxId;
  q('#aEditKind').value = kind;
  q('#aEditId').value = String(item.id);
  q('#aEditPreview').src = resolveUrl(item.url);
  q('#aEditTitle').value = item.title || '';
  q('#aEditYear').value = item.year ?? '';

  // fotografia fields
  const catWrap = q('#aEditCategoryWrap');
  const paintWrap = q('#aEditPaintFields');
  if (kind === 'fotografia') {
    catWrap.style.display = '';
    paintWrap.style.display = 'none';
    q('#aEditCategory').value = item.category || box.dataset.category || 'tema_livre';
  } else {
    catWrap.style.display = 'none';
    paintWrap.style.display = '';
    q('#aEditTechnique').value = item.technique || '';
    q('#aEditDimensions').value = item.dimensions || '';
    q('#aEditType').value = item.type || kind;
  }

  setText('aEditStatus', '');
  show(q('#adminEditModal'), true);
}

async function saveEdit() {
  try {
    ensureLoggedIn();
  } catch {
    await openLogin();
    return;
  }

  const id = q('#aEditId').value;
  const kind = q('#aEditKind').value;
  const boxId = q('#aEditBoxId').value;

  setText('aEditStatus', 'A guardar...');

  try {
    if (kind === 'fotografia') {
      const payload = {
        title: q('#aEditTitle').value || null,
        year: q('#aEditYear').value ? Number(q('#aEditYear').value) : null,
        category: q('#aEditCategory').value || null,
      };
      await fetchJson(`/api/admin/fotos/${id}`, {
        method: 'PATCH',
        headers: authHeaders(true),
        body: JSON.stringify(payload),
      });
    } else {
      const payload = {
        title: q('#aEditTitle').value || null,
        year: q('#aEditYear').value ? Number(q('#aEditYear').value) : null,
        technique: q('#aEditTechnique').value || null,
        dimensions: q('#aEditDimensions').value || null,
        type: q('#aEditType').value || kind,
      };
      await fetchJson(`/api/admin/pinturas/${id}`, {
        method: 'PATCH',
        headers: authHeaders(true),
        body: JSON.stringify(payload),
      });
    }

    // update UI
    show(q('#adminEditModal'), false);
    await refreshAllBoxes();

    // keep cache warm
    const b = document.getElementById(boxId);
    if (b) {
      const items = await fetchJson(b.dataset.endpoint);
      const map = new Map();
      for (const it of items) map.set(String(it.id), it);
      boxCache.set(boxId, map);
    }
  } catch (e) {
    setText('aEditStatus', `Erro: ${e.message}`);
  }
}

async function deleteFromEdit() {
  try {
    ensureLoggedIn();
  } catch {
    await openLogin();
    return;
  }

  if (!confirm('Apagar esta imagem?')) return;

  const id = q('#aEditId').value;
  const kind = q('#aEditKind').value;
  setText('aEditStatus', 'A apagar...');

  try {
    const endpoint = (kind === 'fotografia')
      ? `/api/admin/fotos/${id}`
      : `/api/admin/pinturas/${id}`;

    await fetchJson(endpoint, {
      method: 'DELETE',
      headers: authHeaders(false),
    });

    show(q('#adminEditModal'), false);
    await refreshAllBoxes();
  } catch (e) {
    setText('aEditStatus', `Erro: ${e.message}`);
  }
}

/* ----------------- Upload modal ----------------- */
function openUploadModalForBox(box) {
  ensureModals();
  try {
    ensureLoggedIn();
  } catch {
    // if the admin clicks "add" while not logged in
    openLogin();
    return;
  }

  const kind = box.dataset.kind;
  const category = box.dataset.category || null;

  q('#aUpKind').value = kind;
  q('#aUpCategory').value = category || '';
  q('#aUpTitle').value = '';
  q('#aUpYear').value = '';
  q('#aUpCol').value = '1';
  q('#aUpFile').value = '';

  // show/hide groups
  q('#aUpCategoryWrap').style.display = (kind === 'fotografia') ? '' : 'none';
  q('#aUpPaintFields').style.display = (kind === 'fotografia') ? 'none' : '';

  if (kind === 'fotografia') {
    q('#aUpCategorySelect').value = category || 'tema_livre';
  } else {
    q('#aUpTechnique').value = '';
    q('#aUpDimensions').value = '';
    q('#aUpType').value = kind; // default to current page
  }

  setText('aUpStatus', '');
  show(q('#adminUploadModal'), true);
}

async function doUpload() {
  try {
    ensureLoggedIn();
  } catch {
    await openLogin();
    return;
  }

  setText('aUpStatus', 'A enviar...');

  const kind = q('#aUpKind').value;
  const col = q('#aUpCol').value;
  const title = q('#aUpTitle').value;
  const year = q('#aUpYear').value;
  const file = q('#aUpFile').files[0];

  if (!file) {
    setText('aUpStatus', 'Escolhe uma imagem.');
    return;
  }

  const fd = new FormData();
  fd.append('col', col);
  if (title && String(title).trim()) fd.append('title', String(title).trim());
  if (year && String(year).trim()) fd.append('year', String(year).trim());
  fd.append('file', file);

  let endpoint;
  if (kind === 'fotografia') {
    const cat = q('#aUpCategorySelect').value;
    fd.append('category', cat);
    endpoint = '/api/admin/upload/foto';
  } else {
    const type = q('#aUpType').value;
    fd.append('type', type);
    fd.append('technique', q('#aUpTechnique').value || (type === 'mista' ? 'Técnica mista' : ''));
    fd.append('dimensions', q('#aUpDimensions').value || '');
    endpoint = '/api/admin/upload/pintura';
  }

  try {
    const res = await fetch(`${apiBase()}${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
      body: fd,
    });

    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok) {
      const msg = (data && data.detail) ? data.detail : (typeof data === 'string' ? data : `HTTP ${res.status}`);
      setText('aUpStatus', `Erro: ${msg}`);
      return;
    }

    setText('aUpStatus', 'Upload concluído ✅');
    show(q('#adminUploadModal'), false);
    await refreshAllBoxes();
  } catch (e) {
    setText('aUpStatus', `Erro: ${e.message}`);
  }
}

/* ----------------- Boot ----------------- */
async function init() {
  // only on pages with galleries
  if (!getBoxes().length) return;

  ensureToolbar();
  ensureModals();

  // auto-open login if ?admin=1
  const url = new URL(window.location.href);
  if (!adminOn && url.searchParams.get('admin') === '1') {
    await openLogin();
    return;
  }

  // if session says admin on, activate overlays
  if (adminOn && idToken) {
    await turnOnAdmin();
  } else {
    adminOn = false;
    sessionStorage.removeItem(SS_ON_KEY);
  }
}

document.addEventListener('DOMContentLoaded', init);
