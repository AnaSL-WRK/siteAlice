export function apiBase() {
  // podes sobrescrever no HTML com window.__API_BASE__
  if (window.__API_BASE__) return String(window.__API_BASE__).replace(/\/$/, '');
  // default: backend no subdomínio live
  return 'https://live.alicenasartes.net';
}

export function resolveUrl(u) {
  if (!u) return '';
  const s = String(u);
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  if (s.startsWith('/')) return `${apiBase()}${s}`;
  return s;
}

export async function fetchJson(path, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 2500;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      ...opts,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(t);
    if (e?.name === 'AbortError') throw new Error('Timeout a contactar o servidor.');
    throw new Error('Não foi possível contactar o servidor.');
  } finally {
    clearTimeout(t);
  }

  const ct = res.headers.get('content-type') || '';

  let data = null;
  if (ct.includes('application/json')) data = await res.json();
  else data = await res.text();

  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && data.detail)
        ? data.detail
        : (typeof data === 'string' && data.trim() ? data : `HTTP ${res.status}`);
    throw new Error(msg);
  }

  return data;
}