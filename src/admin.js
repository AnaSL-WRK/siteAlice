import { fetchJson } from './api_client.js';

// --- Google token ---
let idToken = null;

function qs(id) { return document.getElementById(id); }

function show(el, on) { el.style.display = on ? '' : 'none'; }

function setStatus(id, msg) { const el = qs(id); if (el) el.textContent = msg || ''; }

function currentView() {
  const kind = qs('viewKind').value;
  const category = qs('viewCategory').value;
  return { kind, category };
}

function authHeaders(json = true) {
  const h = {
    'Authorization': `Bearer ${idToken}`,
  };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

function ensureLoggedIn() {
  if (!idToken) throw new Error('Faz login com Google primeiro.');
}

// --- Drag & drop ---
let dragEl = null;

function makeDraggable(itemEl) {
  itemEl.draggable = true;
  itemEl.addEventListener('dragstart', (e) => {
    dragEl = itemEl;
    itemEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  itemEl.addEventListener('dragend', () => {
    itemEl.classList.remove('dragging');
    dragEl = null;
  });
}

function setupDropZones() {
  for (const colEl of document.querySelectorAll('.col')) {
    colEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      const list = colEl.querySelector('.list');
      const after = getDragAfterElement(list, e.clientY);
      if (!dragEl) return;
      if (after == null) list.appendChild(dragEl);
      else list.insertBefore(dragEl, after);
    });
  }
}

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll('.item:not(.dragging)')];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

// --- Rendering lists ---
function clearLists() {
  qs('list1').innerHTML = '';
  qs('list2').innerHTML = '';
  qs('list3').innerHTML = '';
}

function deselectAll() {
  for (const el of document.querySelectorAll('.item.selected')) el.classList.remove('selected');
  qs('editId').value = '';
}

function selectItem(itemEl, data) {
  deselectAll();
  itemEl.classList.add('selected');
  qs('editId').value = data.id;
  qs('editTitle').value = data.title || '';
  qs('editYear').value = data.year || '';

  const { kind } = currentView();
  if (kind === 'fotografia') {
    qs('editCategory').value = data.category || qs('viewCategory').value;
    show(qs('editCategoryWrap'), true);
    show(qs('editPaintFields'), false);
  } else {
    show(qs('editCategoryWrap'), false);
    show(qs('editPaintFields'), true);
    qs('editTechnique').value = data.technique || '';
    qs('editDimensions').value = data.dimensions || '';
  }
}

function makeItemEl(data) {
  const el = document.createElement('div');
  el.className = 'item';
  el.dataset.id = data.id;

  const img = document.createElement('img');
  img.src = resolveUrl(data.url);
  img.alt = data.title || '';

  const meta = document.createElement('div');
  meta.className = 'meta';

  const t = document.createElement('div');
  t.className = 't';
  t.textContent = data.title || '(sem título)';

  const s = document.createElement('div');
  s.className = 's';
  const parts = [];
  if (data.year) parts.push(String(data.year));
  if (data.category) parts.push(String(data.category));
  meta.appendChild(t);
  meta.appendChild(s);
  s.textContent = parts.join(' · ');

  el.appendChild(img);
  el.appendChild(meta);

  el.addEventListener('click', () => selectItem(el, data));
  makeDraggable(el);

  return el;
}

async function loadCurrentView() {
  clearLists();
  deselectAll();
  setStatus('manageStatus', 'A carregar...');

  const { kind, category } = currentView();

  let items = [];
  try {
    if (kind === 'fotografia') {
      items = await fetchJson(`/api/fotos?type=fotografia&category=${encodeURIComponent(category)}`);
    } else {
      // pinturas ou mista
      // Prefer query style; if your backend doesn't support, add it on backend.
      items = await fetchJson(`/api/pinturas?type=${encodeURIComponent(kind)}`);
    }
  } catch (e) {
    // fallback endpoints
    if (kind === 'pinturas') items = await fetchJson('/api/pinturas');
    else if (kind === 'mista') items = await fetchJson('/api/mista');
    else throw e;
  }

  for (const it of items) {
    const target = it.col === 2 ? qs('list2') : (it.col === 3 ? qs('list3') : qs('list1'));
    target.appendChild(makeItemEl(it));
  }

  setStatus('manageStatus', `${items.length} itens carregados.`);
}

function getListsState() {
  const state = [];
  for (const col of [1,2,3]) {
    const list = qs(`list${col}`);
    const ids = [...list.querySelectorAll('.item')].map((el) => el.dataset.id);
    ids.forEach((id, idx) => {
      state.push({ id, col, col_order: idx + 1 });
    });
  }
  return state;
}

// --- Actions ---
async function saveOrder() {
  ensureLoggedIn();

  const { kind, category } = currentView();
  const items = getListsState();

  if (kind === 'fotografia') {
    // include category so backend can move items across categories if you want
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

  setStatus('manageStatus', 'Ordem guardada ✅');
  await loadCurrentView();
}

async function saveMeta() {
  ensureLoggedIn();
  const id = qs('editId').value;
  if (!id) { setStatus('manageStatus', 'Seleciona um item primeiro.'); return; }

  const { kind } = currentView();

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

  setStatus('manageStatus', 'Alterações guardadas ✅');
  await loadCurrentView();
}

async function deleteSelected() {
  ensureLoggedIn();
  const id = qs('editId').value;
  if (!id) { setStatus('manageStatus', 'Seleciona um item primeiro.'); return; }
  if (!confirm('Apagar este item?')) return;

  const { kind } = currentView();
  const endpoint = kind === 'fotografia' ? `/api/admin/fotos/${id}` : `/api/admin/pinturas/${id}`;

  await fetchJson(endpoint, {
    method: 'DELETE',
    headers: authHeaders(false),
  });

  setStatus('manageStatus', 'Apagado ✅');
  await loadCurrentView();
}

async function doUpload() {
  ensureLoggedIn();
  setStatus('uploadStatus', 'A enviar...');

  const kind = qs('uploadKind').value;
  const col = qs('uploadCol').value;
  const title = qs('uploadTitle').value;
  const year = qs('uploadYear').value;
  const file = qs('uploadFile').files[0];

  if (!file) { setStatus('uploadStatus', 'Escolhe uma imagem.'); return; }

  const fd = new FormData();
  fd.append('col', col);
  fd.append('title', title || '');
  fd.append('year', year || '');
  fd.append('file', file);

  let endpoint;
  if (kind === 'fotografia') {
    const category = qs('uploadCategory').value;
    fd.append('category', category);
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
    setStatus('uploadStatus', `Erro: ${msg}`);
    return;
  }

  setStatus('uploadStatus', 'Upload concluído ✅');
  qs('uploadFile').value = '';

  await loadCurrentView();
}

function syncUploadFields() {
  const kind = qs('uploadKind').value;
  show(qs('uploadPhotoFields'), kind === 'fotografia');
  show(qs('uploadPaintFields'), kind !== 'fotografia');
}

function syncViewFields() {
  const kind = qs('viewKind').value;
  show(qs('viewCategoryLabel'), kind === 'fotografia');
  show(qs('viewCategory'), kind === 'fotografia');
  show(qs('editCategoryWrap'), kind === 'fotografia');
  show(qs('editPaintFields'), kind !== 'fotografia');
}

// --- Init ---
function initUi() {
  qs('uploadKind').addEventListener('change', syncUploadFields);
  qs('viewKind').addEventListener('change', async () => { syncViewFields(); await loadCurrentView(); });
  qs('viewCategory').addEventListener('change', loadCurrentView);

  qs('btnUpload').addEventListener('click', doUpload);
  qs('btnReload').addEventListener('click', loadCurrentView);
  qs('btnSaveOrder').addEventListener('click', saveOrder);
  qs('btnSaveMeta').addEventListener('click', saveMeta);
  qs('btnDelete').addEventListener('click', deleteSelected);
  qs('btnClearSelection').addEventListener('click', () => { deselectAll(); setStatus('manageStatus', ''); });

  syncUploadFields();
  syncViewFields();
  setupDropZones();
}

function initGoogle() {
  // You MUST replace this with your real client ID.
  const clientId = 'COLOCA_AQUI_O_TEU_GOOGLE_CLIENT_ID';

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => {
      idToken = response.credential;
      show(qs('adminArea'), true);
      show(qs('manageArea'), true);
      setStatus('who', 'Autenticada ✅');
      loadCurrentView();
    },
  });

  window.google.accounts.id.renderButton(qs('gbtn'), { theme: 'outline', size: 'large' });
}

initUi();
window.addEventListener('load', initGoogle);
