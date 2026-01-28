export function apiBase() {
  if (window.__API_BASE__) return window.__API_BASE__;
  return '';
}

export async function fetchJson(path, opts = {}) {
  const res = await fetch(`${apiBase()}${path}`, opts);
  const ct = res.headers.get('content-type') || '';

  let data = null;
  if (ct.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const msg = (data && typeof data === 'object' && data.detail)
      ? data.detail
      : (typeof data === 'string' && data.trim() ? data : `HTTP ${res.status}`);
    throw new Error(msg);
  }

  return data;
}
