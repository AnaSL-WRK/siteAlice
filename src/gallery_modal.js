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

function buildOverlayText(item, overlayMode) {
  if (!overlayMode || overlayMode === 'none') return '';

  if (overlayMode === 'foto') {
    // fotografia: só título
    return item.title ? String(item.title) : '';
  }

  if (overlayMode === 'mista') {
    // técnica mista: título, ano, dimensões
    const lines = [];
    if (item.title) lines.push(item.title);
    if (item.year) lines.push(item.year);
    if (item.dimensions) lines.push(item.dimensions);
    return linesToOverlayHtml(lines);
  }

  // pintura: título, ano, técnica, dimensões
  const lines = [];
  if (item.title) lines.push(item.title);
  if (item.year) lines.push(item.year);
  if (item.technique) lines.push(item.technique);
  if (item.dimensions) lines.push(item.dimensions);
  return linesToOverlayHtml(lines);
}

function createImageNode(item, overlayMode) {
  const container = document.createElement('div');
  container.className = 'image-container';
  container.dataset.id = item.id;

  const img = document.createElement('img');
  img.src = resolveUrl(item.url);
  img.alt = item.title || '';
  container.appendChild(img);

  const overlayHtml = buildOverlayText(item, overlayMode);
  if (overlayHtml) {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const p = document.createElement('p');
    // overlay permite <br>
    p.innerHTML = overlayHtml;

    overlay.appendChild(p);
    container.appendChild(overlay);
  }

  return container;
}

/* ---------------------------
   Universal Modal (instala 1x)
---------------------------- */
let __universalModalInstalled = false;

function ensureUniversalModalDom() {
  let modal = document.getElementById('universalModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'universalModal';
  modal.className = 'u-modal';
  modal.innerHTML = `
    <div class="u-modal-content" role="dialog" aria-modal="true">
      <span class="u-close" aria-label="Fechar">&times;</span>
      <img id="modalImage" src="" alt="">
      <div class="u-modal-description" id="modalDesc"></div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function openModal({ src, descHtml }) {
  const modal = ensureUniversalModalDom();
  const modalImg = modal.querySelector('#modalImage');
  const modalDesc = modal.querySelector('#modalDesc');
  const modalContent = modal.querySelector('.u-modal-content');

  // reset (evita "restos" do item anterior)
  modalDesc.innerHTML = descHtml || '';
  modalImg.onload = null;
  modalImg.onerror = null;

  // opcional: remove estilos inline caso existam de versões antigas
  modalContent.removeAttribute('style');
  modalImg.removeAttribute('style');

  // abre já
  modal.style.display = 'flex';

  // força refresh mesmo que seja o mesmo src
  modalImg.src = '';
  modalImg.src = src;

  // se falhar
  modalImg.onerror = () => {
    // mantém modal aberto mas informa
    modalDesc.innerHTML = (modalDesc.innerHTML || '') + '<br><small>Erro a carregar imagem.</small>';
  };
}

function closeModal() {
  const modal = document.getElementById('universalModal');
  if (!modal) return;
  modal.style.display = 'none';
}

function installUniversalModal() {
  if (__universalModalInstalled) return;
  __universalModalInstalled = true;

  const modal = ensureUniversalModalDom();
  const closeBtn = modal.querySelector('.u-close');

  // fechar por X
  closeBtn.addEventListener('click', closeModal);

  // fechar por click no backdrop
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // fechar por ESC
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Event delegation: abre modal ao clicar numa .image-container
  document.addEventListener('click', (e) => {
    const container = e.target.closest('.image-container');
    if (!container) return;

    // se for tile do admin, não abre modal público
    if (container.classList.contains('add-tile')) return;

    const img = container.querySelector('img');
    if (!img) return;

    const overlayP = container.querySelector('.overlay p');

    openModal({
      src: img.src,
      descHtml: overlayP ? overlayP.innerHTML : '',
    });
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
  // garante modal pronto (1x) antes de renderizar
  installUniversalModal();

  const box = document.getElementById(boxId);
  if (!box) return;

  const hadStatic = box.children.length > 0;
  const staticHTML = hadStatic ? box.innerHTML : '';

  let loading = null;

  // se não havia estático: cria estrutura e loading
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
