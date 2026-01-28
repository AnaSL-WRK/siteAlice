import { fetchJson } from './api_client.js';

function pickDaily(items) {
  const day = new Date().getDate();
  if (!items || items.length === 0) return null;
  return items[day % items.length];
}

async function loadPaintings() {
  try {
    //optional type (pinturas / mista)
    return await fetchJson('/api/pinturas?type=pinturas');
  } catch {
    return await fetchJson('/api/pinturas');
  }
}

async function loadPhotos() {
  try {
    //optional categoria (estruturas / praia / natureza / tema livre)
    return await fetchJson('/api/fotos');
  } catch {
    return await fetchJson('/api/fotos');
  }
}

async function init() {
  //Painting of the day
  try {
    const paintings = await loadPaintings();
    const p = pickDaily(paintings);
    if (p) {
      const img = document.getElementById('randomPainting');
      const desc = document.getElementById('paintingDescription');
      const year = document.getElementById('paintingYear');
      const dim = document.getElementById('paintingDimensions');

      if (img) img.src = p.url;
      if (desc) desc.textContent = p.title || '';
      if (year) year.textContent = p.year || '';
      if (dim) dim.textContent = p.dimensions || '';
    }
  } catch (e) {
  }

  //Photo of the day
  try {
    const photos = await loadPhotos();
    const f = pickDaily(photos);
    if (f) {
      const img = document.getElementById('randomFoto');
      if (img) img.src = f.url;
    }
  } catch (e) {
  }
}

document.addEventListener('DOMContentLoaded', init);
