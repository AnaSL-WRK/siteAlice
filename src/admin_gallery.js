import { fetchJson, apiBase } from './api_client.js';


const GOOGLE_CLIENT_ID = window.__GOOGLE_CLIENT_ID__ || '592470068306-l60g26dm0ria5k2hdeitsn2dk83f6kdr.apps.googleusercontent.com';

/* ---------- Helpers ---------- */
function qs(id) { return document.getElementById(id); }
function show(el, on) { el.style.display = on ? '' : 'none'; }
function setText(id, msg) { const el = qs(id); if (el) el.textContent = msg || ''; }

function resolveUrl(u) {
  if (!u) return '';
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  // respeita apiBase se estiver definido (ex: quando estás atrás do router do CF)
  return `${apiBase()}${u}`;
}

let idToken = null;

/* ---------- View state ---------- */
function currentView() {
  const kind = qs('viewKind').value; // pinturas | mista | fotografia
  const category = qs('viewCategory').value;
  return { kind, category };
}

function syncViewFields() {
  const { kind } = currentView();
  show(qs('viewCategoryWrap'), kind === 'fotografia');
}

function authHeaders(json = true) {
  const h = { 'Authorization': `Bearer ${idToken}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

function ensureLoggedIn() {
  if (!idToken) throw new Error('Faz login com Google primeiro.');
}

/* ---------- Drag & drop reorder ---------- */
let dragEl = null;

function makeDraggable(el) {
  el.draggable = true;

  el.addEventListener('dragstart', (e) => {
    dragEl = el;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    dragEl = null;
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

function setupDropZones() {
  for (const colEl of document.querySelectorAll('.dream')) {
    colEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      const after = getDragAfterElement(colEl, e.clientY);
      if (!dragEl) return;

      // não deixar arrastar por cima do add-tile (fica sempre no topo)
      const addTile = colEl.querySelector('.add-tile');
      if (addTile && dragEl === addTile) return;

      if (after == null) colEl.appendChild(dragEl);
      else colEl.insertBefore(dragEl, after);
    });
  }
}

/* ---------- UI pieces ---------- */
function createDreamColumn() {
  const d = document.createElement('div');
  d.className = 'dream';
  return d;
}

function createAddTile(onClick) {
  const tile = document.createElement('div');
  tile.className = 'image-container add-tile';
  tile.innerHTML = `➕ Adicionar nova imagem<br><small>(abre upload)</small>`;
  tile.addEventListener('click', onClick);
  return tile;
}

function linesToOverlayHtml(lines) {
  return lines
    .filter(Boolean)
    .map(l => String(l).trim())
    .filter(l => l.length > 0)
    .join('<br>');
}

function buildOverlay(item, kind) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const p = document.createElement('p');

  if (kind === 'fotografia') {
    const lines = [];
    if (item.title) lines.push(item.title);
    if (item.year) lines.push(item.year);
    if (item.category) lines.push(item.category);
    p.innerHTML = linesToOverlayHtml(lines);
  } else if (kind === 'mista') {
    const lines = [];
    if (item.title) lines.push(item.title);
    if (item.year) lines.push(item.year);
    if (item.dimensions) lines.push(item.dimensions);
    p.innerHTML = linesToOverlayHtml(lines);
  } else {
    // pinturas
    const lines = [];
    if (item.title) lines.push(item.title);
    if (item.year) lines.push(item.year);
    if (item.technique) lines.push(item.technique);
    if (item.dimensions) lines.push(item.dimensions);
    p.innerHTML = linesToOverlayHtml(lines);
  }

  overlay.appendChild(p);
  return overlay;
}

function createImageNode(item, kind) {
  const container = document.createElement('div');
  container.className = 'image-container';
  container.dataset.id = item.id;

  const img = document.createElement('img');
  img.src = resolveUrl(item.url);
  img.alt = item.title || '';
  container.appendChild(img);

  // overlay (igual às páginas normais)
  container.appendChild(buildOverlay(item, kind));

  // X apagar
  const x = document.createElement('button');
  x.className = 'xbtn';
  x.type = 'button';
  x.textContent = '×';
  x.title = 'Apagar';
  x.addEventListener('click', async (e) => {
    e.stopPropagation();
    await deleteItem(kind, item.id);
  });
  container.appendChild(x);

  // clicar -> editar
  container.addEventListener('click', () => openEditModal(kind, item));

  // drag
  makeDraggable(container);

  return container;
}

/* ---------- Data loading ---------- */
async function fetchItemsForView() {
  const { kind, category } = currentView();

  if (kind === 'fotografia') {
    return await fetchJson(`/api/fotos?type=fotografia&category=${encodeURIComponent(category)}`);
  }
  // pinturas ou mista usam /api/pinturas?type=pinturas|mista
  return await fetchJson(`/api/pinturas?type=${encodeURIComponent(kind)}`);
}

async function renderAdminGallery() {
  ensureLoggedIn();
  syncViewFields();

  setText('adminStatus', 'A carregar...');
  const box = qs('box-admin');
  box.innerHTML = '';

  // 3 colunas (clone)
  const col1 = createDreamColumn();
  const col2 = createDreamColumn();
  const col3 = createDreamColumn();

  box.appendChild(col1);
  box.appendChild(col2);
  box.appendChild(col3);

  // Add tile no topo da coluna 1 (podes mudar para aparecer em todas as colunas se quiseres)
  col1.appendChild(createAddTile(() => openUploadModal()));

  try {
    const items = await fetchItemsForView();
    const { kind } = currentView();

    for (const it of items) {
      const node = createImageNode(it, kind);
      if (it.col === 1) col1.appendChild(node);
      else if (it.col === 2) col2.appendChild(node);
      else col3.appendChild(node);
    }

    setupDropZones();
    setText('adminStatus', `${items.length} itens carregados.`);
  } catch (e) {
    setText('adminStatus', `Erro: ${e.message}`);
  }
}

/* ---------- Save order ---------- */
function getOrderState() {
  const state = [];
  const cols = [
    { col: 1, el: qs('box-admin').children[0] },
    { col: 2, el: qs('box-admin').children[1] },
    { col: 3, el: qs('box-admin').children[2] },
  ];

  for (const { col, el } of cols) {
    const ids = [...el.querySelectorAll('.image-container')]
      .filter(n => !n.classList.contains('add-tile'))
      .map(n => n.dataset.id);

    ids.forEach((id, idx) => state.push({ id, col, col_order: idx + 1 }));
  }
  return state;
}

async function saveOrder() {
  ensureLoggedIn();
  const { kind, category } = currentView();
  const items = getOrderState();

  setText('adminStatus', 'A guardar ordem...');

  if (kind === 'fotografia') {
    const payload = { items: items.map(it => ({ ...it, category })) };
    await fetchJson('/api/admin/reorder/fotos', {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify(payload),
    });
  } else {
    const payload = { items: items.map(it => ({ ...it, type: kind })) };
    await fetchJson('/api/admin/reorder/pinturas', {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify(payload),
    });
  }

  setText('adminStatus', 'Ordem guardada ✅');
  await renderAdminGallery();
}

/* ---------- Delete ---------- */
async function deleteItem(kind, id) {
  ensureLoggedIn();
  if (!confirm('Apagar esta imagem?')) return;

  setText('adminStatus', 'A apagar...');

  const endpoint = (kind === 'fotografia')
    ? `/api/admin/fotos/${id}`
    : `/api/admin/pinturas/${id}`;

  await fetchJson(endpoint, {
    method: 'DELETE',
    headers: authHeaders(false),
  });

  setText('adminStatus', 'Apagado ✅');
  await renderAdminGallery();
}

/* ---------- Upload modal ---------- */
function openUploadModal() {
  // pré-preencher com o view atual
  const { kind, category } = currentView();
  qs('uploadKind').value = kind;
  qs('uploadCategory').value = category;
  qs('uploadCol').value = '1';

  syncUploadFields();
  setText('uploadStatus', '');
  show(qs('uploadModal'), true);
}

function closeUploadModal() {
  show(qs('uploadModal'), false);
}

function syncUploadFields() {
  const kind = qs('uploadKind').value;
  show(qs('uploadCategoryRow'), kind === 'fotografia');
  show(qs('uploadPaintFields'), kind !== 'fotografia');
}

async function doUpload() {
  ensureLoggedIn();

  setText('uploadStatus', 'A enviar...');

  const kind = qs('uploadKind').value;
  const col = qs('uploadCol').value;
  const title = qs('uploadTitle').value;
  const year = qs('uploadYear').value;
  const file = qs('uploadFile').files[0];

  if (!file) { setText('uploadStatus', 'Escolhe uma imagem.'); return; }

  const fd = new FormData();
  fd.append('col', col);
  fd.append('title', title || '');
  fd.append('year', year || '');
  fd.append('file', file);

  let endpoint;
  if (kind === 'fotografia') {
    fd.append('category', qs('uploadCategory').value);
    endpoint = '/api/admin/upload/foto';
  } else {
    fd.append('type', kind);
    fd.append('technique', qs('uploadTechnique').value || (kind === 'mista' ? 'Técnica mista' : ''));
    fd.append('dimensions', qs('uploadDimensions').value || '');
    endpoint = '/api/admin/upload/pintura';
  }

  const res = await fetch(`${apiBase()}${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${idToken}` },
    body: fd,
  });

  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = (data && data.detail) ? data.detail : (typeof data === 'string' ? data : `HTTP ${res.status}`);
    setText('uploadStatus', `Erro: ${msg}`);
    return;
  }

  setText('uploadStatus', 'Upload concluído ✅');
  closeUploadModal();
  await renderAdminGallery();
}

/* ---------- Edit modal ---------- */
let editItemCache = null;

function openEditModal(kind, item) {
  editItemCache = item;

  qs('editId').value = item.id;
  qs('editKind').value = kind;
  qs('editPreview').src = resolveUrl(item.url);

  qs('editTitle').value = item.title || '';
  qs('editYear').value = item.year || '';

  if (kind === 'fotografia') {
    show(qs('editCategoryWrap'), true);
    show(qs('editPaintFields'), false);
    qs('editCategory').value = item.category || qs('viewCategory').value;
  } else {
    show(qs('editCategoryWrap'), false);
    show(qs('editPaintFields'), true);
    qs('editTechnique').value = item.technique || '';
    qs('editDimensions').value = item.dimensions || '';
  }

  setText('editStatus', '');
  show(qs('editModal'), true);
}

function closeEditModal() {
  show(qs('editModal'), false);
  editItemCache = null;
}

async function saveEdit() {
  ensureLoggedIn();

  const id = qs('editId').value;
  const kind = qs('editKind').value;

  setText('editStatus', 'A guardar...');

  if (kind === 'fotografia') {
    const payload = {
      title: qs('editTitle').value || null,
      year: qs('editYear').value ? Number(qs('editYear').value) : null,
      category: qs('editCategory').value || null,
    };
    await fetchJson(`/api/admin/fotos/${id}`, {
      method: 'PATCH',
      headers: authHeaders(true),
      body: JSON.stringify(payload),
    });
  } else {
    const payload = {
      title: qs('editTitle').value || null,
      year: qs('editYear').value ? Number(qs('editYear').value) : null,
      technique: qs('editTechnique').value || null,
      dimensions: qs('editDimensions').value || null,
      type: kind,
    };
    await fetchJson(`/api/admin/pinturas/${id}`, {
      method: 'PATCH',
      headers: authHeaders(true),
      body: JSON.stringify(payload),
    });
  }

  setText('editStatus', 'Alterações guardadas ✅');
  closeEditModal();
  await renderAdminGallery();
}

async function deleteFromEdit() {
  const kind = qs('editKind').value;
  const id = qs('editId').value;
  closeEditModal();
  await deleteItem(kind, id);
}

/* ---------- Google login ---------- */
function initGoogle() {
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    auto_select: false,
    callback: (response) => {
      idToken = response.credential;
      setText('who', 'Autenticada ✅');
      show(qs('adminArea'), true);
      renderAdminGallery();
    },
  });

  window.google.accounts.id.renderButton(qs('gbtn'), {
    theme: 'outline',
    size: 'large',
    type: 'standard',
  });

  // trocar conta (forçar chooser)
  qs('btnSwitch').addEventListener('click', () => {
    window.google.accounts.id.disableAutoSelect();
    window.google.accounts.id.prompt(); // força escolha
  });

  // “logout” (para o GSI, o mais comum é desativar auto_select e limpar token local)
  qs('btnLogout').addEventListener('click', () => {
    idToken = null;
    show(qs('adminArea'), false);
    setText('who', 'Sessão terminada.');
    window.google.accounts.id.disableAutoSelect();
  });
}

/* ---------- Wire up ---------- */
function bindUi() {
  qs('viewKind').addEventListener('change', async () => { syncViewFields(); await renderAdminGallery(); });
  qs('viewCategory').addEventListener('change', renderAdminGallery);

  qs('btnReload').addEventListener('click', renderAdminGallery);
  qs('btnSaveOrder').addEventListener('click', saveOrder);

  // upload modal
  qs('uploadKind').addEventListener('change', syncUploadFields);
  qs('uploadClose').addEventListener('click', closeUploadModal);
  qs('btnCancelUpload').addEventListener('click', closeUploadModal);
  qs('btnDoUpload').addEventListener('click', doUpload);

  // edit modal
  qs('editClose').addEventListener('click', closeEditModal);
  qs('btnSaveEdit').addEventListener('click', saveEdit);
  qs('btnDeleteEdit').addEventListener('click', deleteFromEdit);

  // fechar modal clicando fora
  window.addEventListener('click', (e) => {
    if (e.target === qs('uploadModal')) closeUploadModal();
    if (e.target === qs('editModal')) closeEditModal();
  });

  syncViewFields();
  syncUploadFields();
}

bindUi();
window.addEventListener('load', initGoogle);
