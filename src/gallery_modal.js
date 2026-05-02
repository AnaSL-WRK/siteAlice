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
    .map((l) => String(l).trim())
    .filter((l) => l.length > 0)
    .join('<br>');
}

function formatDatePt(value) {
  if (!value) return '';

  // Backend normally sends YYYY-MM-DD.
  // Adding T00:00:00 avoids timezone shifts when formatting.
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(value);

  return d.toLocaleDateString('pt-PT');
}

function buildOverlayText(item, overlayMode) {
  if (!overlayMode || overlayMode === 'none') return '';

  if (overlayMode === 'foto') {
    return item.title ? String(item.title) : '';
  }

  if (overlayMode === 'video') {
    const lines = [];

    if (item.title) lines.push(item.title);
    if (item.published_date) lines.push(formatDatePt(item.published_date));
    if (item.year) lines.push(item.year);

    return linesToOverlayHtml(lines);
  }

  if (overlayMode === 'mista') {
    const lines = [];

    if (item.title) lines.push(item.title);
    if (item.year) lines.push(item.year);
    if (item.dimensions) lines.push(item.dimensions);

    return linesToOverlayHtml(lines);
  }

  // Default: pinturas
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

  const isVideo = item.media_type === 'video' || overlayMode === 'video';
  container.dataset.media = isVideo ? 'video' : 'image';

  const overlayHtml = buildOverlayText(item, overlayMode);

  // Important: keep the modal description independent from the visual overlay.
  // This makes title/date appear in the modal even if the overlay is hidden by CSS.
  container.dataset.descHtml = overlayHtml || '';

  if (isVideo) {
    const videoUrl = resolveUrl(item.url);
    container.dataset.videoSrc = videoUrl;

    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.className = 'video-thumb';
    video.setAttribute('aria-label', item.title || 'Vídeo');

    // Best option: use generated thumbnail image from backend.
    if (item.thumbnail_url) {
      const thumbUrl = resolveUrl(item.thumbnail_url);
      video.poster = thumbUrl;
      container.dataset.thumbnailSrc = thumbUrl;
    }

    // Fallback: if no thumbnail image exists, seek to the chosen moment.
    video.addEventListener('loadedmetadata', () => {
      if (item.thumbnail_url) return;

      const t = Number(item.thumbnail_time);
      if (!Number.isFinite(t) || t <= 0) return;

      try {
        video.currentTime = Math.min(t, video.duration || t);
      } catch {
        // Ignore browsers that block seeking before enough metadata is ready.
      }
    });

    container.appendChild(video);

    const play = document.createElement('div');
    play.className = 'video-play-indicator';
    play.textContent = '▶';
    container.appendChild(play);
  } else {
    const img = document.createElement('img');
    img.src = resolveUrl(item.url);
    img.alt = item.title || '';
    container.appendChild(img);
  }

  if (overlayHtml) {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const p = document.createElement('p');
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
      <video id="modalVideo" controls playsinline style="display:none;"></video>
      <div class="u-modal-description" id="modalDesc"></div>
    </div>
  `;

  document.body.appendChild(modal);
  return modal;
}

function stopModalVideo(modal) {
  const modalVideo = modal?.querySelector('#modalVideo');
  if (!modalVideo) return;

  modalVideo.pause();
  modalVideo.removeAttribute('src');
  modalVideo.load();
}

function openImageModal({ src, descHtml }) {
  const modal = ensureUniversalModalDom();
  const modalImg = modal.querySelector('#modalImage');
  const modalVideo = modal.querySelector('#modalVideo');
  const modalDesc = modal.querySelector('#modalDesc');
  const modalContent = modal.querySelector('.u-modal-content');

  stopModalVideo(modal);

  modalContent.classList.remove('is-video');
  modalContent.removeAttribute('style');

  modalVideo.style.display = 'none';
  modalVideo.removeAttribute('src');

  modalImg.removeAttribute('style');
  modalImg.style.display = 'block';

  modalDesc.innerHTML = descHtml || '';

  modal.style.display = 'flex';

  modalImg.src = '';
  modalImg.src = src;

  modalImg.onerror = () => {
    modalDesc.innerHTML = `${modalDesc.innerHTML || ''}<br><small>Erro a carregar imagem.</small>`;
  };
}

function openVideoModal({ src, descHtml }) {
  const modal = ensureUniversalModalDom();
  const modalImg = modal.querySelector('#modalImage');
  const modalVideo = modal.querySelector('#modalVideo');
  const modalDesc = modal.querySelector('#modalDesc');
  const modalContent = modal.querySelector('.u-modal-content');

  modalImg.style.display = 'none';
  modalImg.removeAttribute('src');

  modalVideo.style.display = 'block';
  modalVideo.src = src;

  modalDesc.innerHTML = descHtml || '';

  modalContent.removeAttribute('style');
  modalContent.classList.add('is-video');
  modalContent.style.height = '90%';

  modal.style.display = 'flex';

  modalVideo.play().catch(() => {
    // If autoplay is blocked, the user can press play manually.
  });
}

function closeModal() {
  const modal = document.getElementById('universalModal');
  if (!modal) return;

  stopModalVideo(modal);
  modal.style.display = 'none';
}

function installUniversalModal() {
  if (__universalModalInstalled) return;
  __universalModalInstalled = true;

  const modal = ensureUniversalModalDom();
  const closeBtn = modal.querySelector('.u-close');

  closeBtn.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Event delegation: works for dynamically rendered gallery items.
  document.addEventListener('click', (e) => {
    const container = e.target.closest('.image-container');
    if (!container) return;

    if (container.classList.contains('add-tile')) return;

    // Important: use dataset description, not only overlay <p>.
    // This keeps title/date in the modal even when overlay is hidden or changed.
    const descHtml = container.dataset.descHtml || '';

    if (container.dataset.media === 'video') {
      const src = container.dataset.videoSrc || container.querySelector('video')?.src;
      if (!src) return;

      openVideoModal({
        src,
        descHtml,
      });

      return;
    }

    const img = container.querySelector('img');
    if (!img) return;

    openImageModal({
      src: img.src,
      descHtml,
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
  installUniversalModal();

  const box = document.getElementById(boxId);
  if (!box) return;

  const hadStatic = box.children.length > 0;
  const staticHTML = hadStatic ? box.innerHTML : '';

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
    if (keepStaticOnFail && hadStatic) {
      box.innerHTML = staticHTML;
      return;
    }

    if (loading) loading.textContent = 'Offline (a mostrar versão simples).';
  }
}
