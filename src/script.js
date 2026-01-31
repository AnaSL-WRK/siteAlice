import { fetchJson, resolveUrl } from './api_client.js';

function pickDaily(items) {
  const day = new Date().getDate();
  if (!items || items.length === 0) return null;
  return items[day % items.length];
}

async function init() {
  // Painting of the day
  try {
    const paintings = await fetchJson('/api/pinturas?type=pinturas', { timeoutMs: 2000 });
    const p = pickDaily(paintings);
    if (p) {
      const img = document.getElementById('randomPainting');
      const desc = document.getElementById('paintingDescription');
      const year = document.getElementById('paintingYear');
      const dim = document.getElementById('paintingDimensions');

      if (img) img.src = resolveUrl(p.url);
      if (desc) desc.textContent = p.title || '';
      if (year) year.textContent = p.year || '';
      if (dim) dim.textContent = p.dimensions || '';
    }
  } catch {}

  // Photo of the day (ex: tema_livre ou praia; escolhe uma category fixa, ou faz 1 fetch por category)
  try {
    const photos = await fetchJson('/api/fotos?type=fotografia&category=tema_livre', { timeoutMs: 2000 });
    const f = pickDaily(photos);
    if (f) {
      const img = document.getElementById('randomFoto');
      if (img) img.src = resolveUrl(f.url);
    }
  } catch {}
}

document.addEventListener('DOMContentLoaded', init);