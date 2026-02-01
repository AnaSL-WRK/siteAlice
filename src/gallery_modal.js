// src/gallery_modal.js
import { fetchJson, resolveUrl } from './api_client.js';

function createDreamColumn() {
  const d = document.createElement('div');
  d.className = 'dream';
  return d;
}

function linesToOverlayHtml(lines) {
  return lines
    .filter(Boolean)
    .map(l => String(l).trim())
    .filter(l => l.length > 0)
    .join('<br>');
}

function createImageNode(item, overlayMode) {
  const container = document.createElement('div');
  container.className = 'image-container';
  container.dataset.id = item.id;

  const img = document.createElement('img');
  img.src = resolveUrl(item.url); 
  img.alt = item.title || '';
  container.appendChild(img);

  if (overlayMode && overlayMode !== 'none') {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const p = document.createElement('p');

    if (overlayMode === 'foto') {
      p.textContent = item.title || '';
    } else if (overlayMode === 'mista') {
      const lines = [];
      if (item.title) lines.push(item.title);
      if (item.year) lines.push(item.year);
      if (item.dimensions) lines.push(item.dimensions);
      p.innerHTML = linesToOverlayHtml(lines);
    } else {
      // pintura
      const lines = [];
      if (item.title) lines.push(item.title);
      if (item.year) lines.push(item.year);
      if (item.technique) lines.push(item.technique);
      if (item.dimensions) lines.push(item.dimensions);
      p.innerHTML = linesToOverlayHtml(lines);
    }

    overlay.appendChild(p);
    container.appendChild(overlay);
  }

  return container;
}

// ---------------------------
// Universal Modal (instala 1x)
// ---------------------------
let __universalModalInstalled = false;

function ensureUniversalModalDom() {
  let modal = document.getElementById('universalModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'universalModal';
  modal.className = 'u-modal';
  modal.innerHTML = `
    <div class="u-modal-content">
      <span class="u-close">&times;</span>
      <img id="modalImage" src="" alt="">
      <div class="u-modal-description" id="modalDesc"></div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function installUniversalModal() {
  if (__universalModalInstalled) return;
  __universalModalInstalled = true;

  const modal = ensureUniversalModalDom();
  const modalImg = modal.querySelector('#modalImage');
  const modalDesc = modal.querySelector('#modalDesc');
  const closeBtn = modal.querySelector('.u-close');
  const modalContent = modal.querySelector('.u-modal-content');

  const close = () => { modal.style.display = 'none'; };

  // fechar
  closeBtn.addEventListener('click', close);

  window.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  // Event delegation: funciona para elementos criados dinamicamente
  document.addEventListener('click', (e) => {
    const container = e.target.closest('.image-container');
    if (!container) return;

    const img = container.querySelector('img');
    if (!img) return;

    const overlay = container.querySelector('.overlay');
    const overlayP = overlay?.querySelector('p');

    // define onload ANTES de trocar src
    modal.style.display = 'none';

    modalImg.onload = () => {
      const imgWidth = modalImg.naturalWidth || 0;
      modalContent.style.height = (imgWidth > 500) ? '80%' : '100%';
      modal.style.display = 'flex';
    };

    modalImg.src = img.src;

    // descrição (HTML do overlay)
    modalDesc.innerHTML = overlayP?.innerHTML ?? '';

    // garantir que aparece
    const p = modalDesc.querySelector('p');
    if (p) p.style.display = 'block';
  });
}

/**
 * Progressive enhancement:
 * - se já houver HTML estático dentro do box, mantém-se caso a API falhe
 * - só substitui quando o fetch der OK
 */
export async function renderBox({
  boxId,
  endpoint,
  overlayMode = 'none',
  timeoutMs = 2000,
  keepStaticOnFail = true,
}) {
  // ✅ garante modal pronto (uma vez) antes de renderizar
  installUniversalModal();

  const box = document.getElementById(boxId);
  if (!box) return;

  const hadStatic = box.children.length > 0;
  const staticHTML = hadStatic ? box.innerHTML : '';

  // Mostra hint só se não houver estático
  let loading = null;
  if (!hadStatic) {
    box.innerHTML = '';
    const col1 = createDreamColumn();
    const col2 = createDreamColumn();
    const col3 = createDreamColumn();
    box.appendChild(col1);
    box.appendChild(col2);
    box.appendChild(col3);

    loading = document.createElement('div');
    loading.style.padding = '20px';
    loading.style.color = 'navy';
    loading.textContent = 'A carregar...';
    box.appendChild(loading);
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    const items = await fetchJson(endpoint, { signal: ctrl.signal });
    clearTimeout(t);

    // substituir pelo dinâmico
    box.innerHTML = '';
    const col1 = createDreamColumn();
    const col2 = createDreamColumn();
    const col3 = createDreamColumn();
    box.appendChild(col1);
    box.appendChild(col2);
    box.appendChild(col3);

    for (const it of items) {
      const node = createImageNode(it, overlayMode);
      if (it.col === 1) col1.appendChild(node);
      else if (it.col === 2) col2.appendChild(node);
      else col3.appendChild(node);
    }
  } catch (err) {
    // Falhou: se havia estático, mantém. Se não havia, mostra erro.
    if (keepStaticOnFail && hadStatic) {
      box.innerHTML = staticHTML;
      return;
    }
    if (loading) loading.textContent = 'Offline (a mostrar versão simples).';
  }
}
