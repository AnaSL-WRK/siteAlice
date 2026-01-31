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
  img.src = resolveUrl(item.url);   // <<< importante
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
    const items = await fetchJson(endpoint, { timeoutMs });

    // Agora sim: substituir pelo dinâmico
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
    if (loading) loading.textContent = `Offline (a mostrar versão simples).`;
  }
}