// src/admin_overlay.js
// Admin overlays on top of the *existing* public pages.
// - Central login at /admin (stores token in localStorage)
// - Pages enter admin mode ONLY if ?admin=1
// - Drag to reorder, Save/Cancel toolbar
// - Click image/video to edit metadata
// - "Add new" tile opens upload modal
// - Keep admin=1 across navbar links
// - Auto-scroll while dragging
// - Video upload supports selecting a thumbnail moment

import { fetchJson, apiBase, resolveUrl } from "./api_client.js";
import { renderBox } from "./gallery_modal.js";

const SS_TOKEN_KEY = "alicenasartes_admin_id_token";
const SS_ON_KEY = "alicenasartes_admin_on";
const STORE = localStorage;

let idToken = STORE.getItem(SS_TOKEN_KEY) || null;
let adminOn = STORE.getItem(SS_ON_KEY) === "1";
let dirty = false;

let dragEl = null;
let dragOriginBoxId = null;

let uploadThumbBlob = null;
let uploadThumbPreviewUrl = null;
let uploadVideoPreviewUrl = null;

let editThumbBlob = null;
let editThumbPreviewUrl = null;

const urlNow = new URL(window.location.href);
const isAdminUrl = urlNow.searchParams.get("admin") === "1";

function isVideoKind(kind) {
  return kind === "videos" || kind === "video";
}

/* ----------------- DOM helpers ----------------- */
function q(sel, root = document) {
  return root.querySelector(sel);
}

function qa(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

function getBoxes() {
  return qa(".box[data-endpoint][data-kind]");
}

function show(el, on) {
  if (!el) return;
  el.style.display = on ? "flex" : "none";
}

function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt || "";
}

function authHeaders(json = true) {
  const h = { Authorization: `Bearer ${idToken}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function ensureLoggedIn() {
  if (!idToken) throw new Error("Sessão expirada. Faz login novamente.");
}

function setDirty(on) {
  dirty = !!on;
  const saveBtn = q("#adminBtnSave");
  if (saveBtn) saveBtn.disabled = !dirty;
  setText("adminToolbarStatus", dirty ? "Alterações por guardar" : "");
}

/* ----------------- Navbar keep ?admin=1 ----------------- */
function rewriteLinksForAdmin() {
  if (!isAdminUrl || !adminOn || !idToken) return;

  for (const a of qa("a[href]")) {
    const href = a.getAttribute("href");
    if (!href) continue;

    if (href.startsWith("#")) continue;
    if (href.startsWith("mailto:")) continue;
    if (href.startsWith("http://") || href.startsWith("https://")) continue;
    if (href.toLowerCase().endsWith(".pdf")) continue;

    const u = new URL(href, location.origin);

    const isHtml = u.pathname.endsWith(".html");
    const isFolder = u.pathname.endsWith("/");
    if (!isHtml && !isFolder) continue;

    u.searchParams.set("admin", "1");

    a.setAttribute(
      "href",
      u.pathname + "?" + u.searchParams.toString() + u.hash
    );
  }
}

function keepRewritingNavForAWhile() {
  rewriteLinksForAdmin();
  setTimeout(rewriteLinksForAdmin, 150);
  setTimeout(rewriteLinksForAdmin, 450);
  setTimeout(rewriteLinksForAdmin, 900);
}

/* ----------------- Auto-repor ?admin=1 se já estiveres em sessão ----------------- */
function guardAdminParam() {
  const token = STORE.getItem(SS_TOKEN_KEY);
  const on = STORE.getItem(SS_ON_KEY) === "1";
  if (!token || !on) return;

  const u = new URL(location.href);
  if (u.searchParams.get("admin") === "1") return;

  u.searchParams.set("admin", "1");
  location.replace(u.pathname + "?" + u.searchParams.toString() + u.hash);
}

/* ----------------- UI: toolbar + modals ----------------- */
function ensureToolbar() {
  if (q("#adminToolbar")) return;

  const bar = document.createElement("div");
  bar.id = "adminToolbar";
  bar.className = "admin-toolbar";
  bar.style.display = "none";

  bar.innerHTML = `
    <div class="left">
      <span class="status" style="font-weight:800;">Modo Admin</span>
      <span class="status" id="adminToolbarStatus"></span>
    </div>
    <div class="right">
      <button id="adminBtnSave" class="primary" type="button" disabled>Guardar</button>
      <button id="adminBtnCancel" class="secondary" type="button">Cancelar</button>
      <button id="adminBtnLogout" class="danger" type="button">Sair</button>
    </div>
  `;

  document.body.appendChild(bar);

  q("#adminBtnSave").addEventListener("click", saveAll);
  q("#adminBtnCancel").addEventListener("click", cancelAll);
  q("#adminBtnLogout").addEventListener("click", logout);
}

let __modalCloseHandlersInstalled = false;

function ensureModals() {
  // Edit modal
  if (!q("#adminEditModal")) {
    const el = document.createElement("div");
    el.id = "adminEditModal";
    el.className = "a-modal";

    el.innerHTML = `
      <div class="a-content">
        <span class="a-close" data-close="adminEditModal">&times;</span>
        <h3>Editar</h3>

        <img id="aEditPreview" class="a-preview" alt="" />
        <video id="aEditVideoPreview" class="a-preview" controls playsinline style="display:none;"></video>

        <input type="hidden" id="aEditId" />
        <input type="hidden" id="aEditKind" />
        <input type="hidden" id="aEditBoxId" />

        <label>Título</label>
        <input id="aEditTitle" />

        <div class="row">
          <div id="aEditYearWrap">
            <label>Ano</label>
            <input id="aEditYear" type="number" />
          </div>

          <div id="aEditCategoryWrap" style="display:none;">
            <label>Categoria (fotografia)</label>
            <select id="aEditCategory">
              <option value="estruturas">Estruturas</option>
              <option value="praia">Praia</option>
              <option value="natureza">Natureza</option>
              <option value="tema_livre">Tema Livre</option>
            </select>
          </div>
        </div>

        <div id="aEditVideoFields" style="display:none;">
          <label>Data de publicação</label>
          <input id="aEditPublishedDate" type="date" />

          <label>Nova thumbnail</label>
          <div class="row">
            <div>
              <input id="aEditThumbTime" type="number" min="0" step="0.1" value="0" />
            </div>
            <div>
              <input id="aEditThumbRange" type="range" min="0" max="0" step="0.1" value="0" disabled />
            </div>
          </div>

          <div class="actions">
            <button class="secondary" id="aBtnEditUseCurrentVideoTime" type="button">Usar momento atual</button>
            <button class="secondary" id="aBtnEditPreviewThumb" type="button">Pré-visualizar nova thumbnail</button>
          </div>

          <img id="aEditThumbPreview" class="a-preview" alt="Nova thumbnail" style="display:none; margin-top:12px;" />
          <div class="small" id="aEditThumbHint"></div>
        </div>

        <div id="aEditPaintFields" style="display:none;">
          <div class="row">
            <div>
              <label>Técnica</label>
              <input id="aEditTechnique" />
            </div>
            <div>
              <label>Dimensões</label>
              <input id="aEditDimensions" />
            </div>
          </div>

          <div class="row">
            <div>
              <label>Tipo</label>
              <select id="aEditType">
                <option value="pinturas">Pinturas</option>
                <option value="mista">Técnica mista</option>
              </select>
            </div>
            <div></div>
          </div>
        </div>

        <div class="actions">
          <button class="primary" id="aBtnSaveEdit" type="button">Guardar alterações</button>
          <button class="danger" id="aBtnDeleteEdit" type="button">Apagar</button>
          <button class="secondary" type="button" data-close="adminEditModal">Cancelar</button>
        </div>

        <div class="status" id="aEditStatus"></div>
      </div>
    `;

    document.body.appendChild(el);

    q("#aBtnSaveEdit").addEventListener("click", saveEdit);
    q("#aBtnDeleteEdit").addEventListener("click", deleteFromEdit);
    q("#aEditThumbTime").addEventListener("input", syncEditThumbNumberToRange);
    q("#aEditThumbRange").addEventListener("input", syncEditThumbRangeToNumber);
    q("#aBtnEditUseCurrentVideoTime").addEventListener("click", useCurrentEditVideoTimeForThumbnail);
    q("#aBtnEditPreviewThumb").addEventListener("click", previewEditVideoThumbnail);
  }

  // Upload modal
  if (!q("#adminUploadModal")) {
    const el = document.createElement("div");
    el.id = "adminUploadModal";
    el.className = "a-modal";

    el.innerHTML = `
      <div class="a-content">
        <span class="a-close" data-close="adminUploadModal">&times;</span>
        <h3 id="aUpModalTitle">Adicionar novo item</h3>

        <input type="hidden" id="aUpKind" />
        <input type="hidden" id="aUpCategory" />

        <div class="row">
          <div>
            <label>Coluna</label>
            <select id="aUpCol">
              <option value="1">Coluna 1</option>
              <option value="2">Coluna 2</option>
              <option value="3">Coluna 3</option>
            </select>
          </div>

          <div id="aUpYearWrap">
            <label>Ano</label>
            <input id="aUpYear" type="number" />
          </div>
        </div>

        <label>Título</label>
        <input id="aUpTitle" />

        <div id="aUpPublishedDateWrap" style="display:none;">
          <label>Data de publicação</label>
          <input id="aUpPublishedDate" type="date" />
        </div>

        <div id="aUpCategoryWrap" style="display:none;">
          <label>Categoria (fotografia)</label>
          <select id="aUpCategorySelect">
            <option value="estruturas">Estruturas</option>
            <option value="praia">Praia</option>
            <option value="natureza">Natureza</option>
            <option value="tema_livre">Tema Livre</option>
          </select>
        </div>

        <div id="aUpPaintFields" style="display:none;">
          <div class="row">
            <div>
              <label>Técnica</label>
              <input id="aUpTechnique" placeholder="ex: Acrílico sobre tela" />
            </div>
            <div>
              <label>Dimensões</label>
              <input id="aUpDimensions" placeholder="ex: 70 x 50 cm" />
            </div>
          </div>

          <label>Tipo</label>
          <select id="aUpType">
            <option value="pinturas">Pinturas</option>
            <option value="mista">Técnica mista</option>
          </select>
        </div>

        <label id="aUpFileLabel">Ficheiro</label>
        <input id="aUpFile" type="file" accept="image/*" />

        <div id="aUpVideoThumbFields" style="display:none;">
          <label>Pré-visualização do vídeo</label>
          <video id="aUpVideoPreview" class="a-preview" controls playsinline style="display:none;"></video>

          <label>Momento da thumbnail</label>
          <div class="row">
            <div>
              <input id="aUpThumbTime" type="number" min="0" step="0.1" value="0" />
            </div>
            <div>
              <input id="aUpThumbRange" type="range" min="0" max="0" step="0.1" value="0" disabled />
            </div>
          </div>

          <div class="actions">
            <button class="secondary" id="aBtnUseCurrentVideoTime" type="button">Usar momento atual</button>
            <button class="secondary" id="aBtnPreviewThumb" type="button">Pré-visualizar thumbnail</button>
          </div>

          <img id="aThumbPreview" class="a-preview" alt="Thumbnail escolhida" style="display:none; margin-top:12px;" />
          <div class="small" id="aThumbHint"></div>
        </div>

        <div class="actions">
          <button class="primary" id="aBtnDoUpload" type="button">Fazer upload</button>
          <button class="secondary" type="button" data-close="adminUploadModal">Cancelar</button>
        </div>

        <div class="status" id="aUpStatus"></div>
      </div>
    `;

    document.body.appendChild(el);

    q("#aBtnDoUpload").addEventListener("click", doUpload);
    q("#aUpFile").addEventListener("change", handleUploadFileChange);
    q("#aUpThumbTime").addEventListener("input", syncThumbNumberToRange);
    q("#aUpThumbRange").addEventListener("input", syncThumbRangeToNumber);
    q("#aBtnUseCurrentVideoTime").addEventListener("click", useCurrentVideoTimeForThumbnail);
    q("#aBtnPreviewThumb").addEventListener("click", previewUploadVideoThumbnail);
  }

  installModalCloseHandlers();
}

function installModalCloseHandlers() {
  if (__modalCloseHandlersInstalled) return;
  __modalCloseHandlersInstalled = true;

  document.addEventListener("click", (e) => {
    const close = e.target.closest("[data-close]");
    if (!close) return;

    const id = close.getAttribute("data-close");
    const m = document.getElementById(id);

    if (m) {
      stopEditPreviewVideo();
      resetUploadVideoTools();
      show(m, false);
    }
  });

  document.addEventListener("click", (e) => {
    const m = e.target.closest(".a-modal");
    if (!m) return;

    if (e.target === m) {
      stopEditPreviewVideo();
      resetUploadVideoTools();
      show(m, false);
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    stopEditPreviewVideo();
    resetUploadVideoTools();

    for (const m of qa(".a-modal")) {
      show(m, false);
    }
  });
}

function stopEditPreviewVideo() {
  const v = q("#aEditVideoPreview");
  if (!v) return;

  v.pause();
  v.removeAttribute("src");
  v.load();
}

/* ----------------- Video thumbnail helpers ----------------- */
function clearUploadThumbnailOnly() {
  uploadThumbBlob = null;

  if (uploadThumbPreviewUrl) {
    URL.revokeObjectURL(uploadThumbPreviewUrl);
    uploadThumbPreviewUrl = null;
  }

  const preview = q("#aThumbPreview");
  if (preview) {
    preview.removeAttribute("src");
    preview.style.display = "none";
  }
}

function resetUploadVideoTools() {
  clearUploadThumbnailOnly();

  const video = q("#aUpVideoPreview");
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.style.display = "none";
  }

  if (uploadVideoPreviewUrl) {
    URL.revokeObjectURL(uploadVideoPreviewUrl);
    uploadVideoPreviewUrl = null;
  }

  const range = q("#aUpThumbRange");
  if (range) {
    range.value = "0";
    range.max = "0";
    range.disabled = true;
  }

  const time = q("#aUpThumbTime");
  if (time) {
    time.value = "0";
    time.removeAttribute("max");
  }

  setText("aThumbHint", "");
}

function clearEditThumbnailOnly() {
  editThumbBlob = null;

  if (editThumbPreviewUrl) {
    URL.revokeObjectURL(editThumbPreviewUrl);
    editThumbPreviewUrl = null;
  }

  const preview = q("#aEditThumbPreview");
  if (preview) {
    preview.removeAttribute("src");
    preview.style.display = "none";
  }
}

function clampEditThumbTime(value) {
  const range = q("#aEditThumbRange");
  const max = Number(range?.max || 0);

  let n = Number(value);
  if (!Number.isFinite(n)) n = 0;
  if (n < 0) n = 0;
  if (max > 0 && n > max) n = max;

  return Number(n.toFixed(1));
}

function syncEditThumbNumberToRange() {
  const time = q("#aEditThumbTime");
  const range = q("#aEditThumbRange");

  const t = clampEditThumbTime(time.value);
  time.value = String(t);
  if (range) range.value = String(t);

  clearEditThumbnailOnly();
}

function syncEditThumbRangeToNumber() {
  const time = q("#aEditThumbTime");
  const range = q("#aEditThumbRange");

  const t = clampEditThumbTime(range.value);
  range.value = String(t);
  if (time) time.value = String(t);

  clearEditThumbnailOnly();
}

async function useCurrentEditVideoTimeForThumbnail() {
  const video = q("#aEditVideoPreview");

  if (!video || !video.src) {
    setText("aEditStatus", "Não há vídeo carregado.");
    return;
  }

  const t = clampEditThumbTime(video.currentTime || 0);
  q("#aEditThumbTime").value = String(t);
  q("#aEditThumbRange").value = String(t);

  await previewEditVideoThumbnail();
}

async function previewEditVideoThumbnail() {
  const video = q("#aEditVideoPreview");
  const time = clampEditThumbTime(q("#aEditThumbTime")?.value || 0);

  if (!video || !video.src) {
    setText("aEditStatus", "Não há vídeo carregado.");
    return;
  }

  try {
    setText("aEditStatus", "A gerar nova thumbnail...");

    editThumbBlob = await captureVideoFrame(video.currentSrc || video.src, time);

    if (editThumbPreviewUrl) {
      URL.revokeObjectURL(editThumbPreviewUrl);
    }

    editThumbPreviewUrl = URL.createObjectURL(editThumbBlob);

    const preview = q("#aEditThumbPreview");
    preview.src = editThumbPreviewUrl;
    preview.style.display = "block";

    setText("aEditStatus", "Nova thumbnail pronta");
  } catch (e) {
    setText("aEditStatus", `Erro: ${e.message}`);
  }
}


function handleUploadFileChange() {
  const kind = q("#aUpKind")?.value || "";
  const file = q("#aUpFile")?.files?.[0];

  resetUploadVideoTools();

  if (!isVideoKind(kind)) return;
  if (!file) return;

  const video = q("#aUpVideoPreview");
  const range = q("#aUpThumbRange");
  const time = q("#aUpThumbTime");

  uploadVideoPreviewUrl = URL.createObjectURL(file);

  video.src = uploadVideoPreviewUrl;
  video.style.display = "block";

  video.onloadedmetadata = () => {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const max = Math.max(0, duration).toFixed(1);

    range.max = max;
    range.disabled = false;
    range.value = "0";

    time.max = max;
    time.value = "0";

    setText("aThumbHint", `Duração: ${max}s. Escolhe o momento e pré-visualiza a thumbnail.`);
  };

  video.onerror = () => {
    setText("aUpStatus", "Erro ao carregar pré-visualização do vídeo.");
  };
}

function clampThumbTime(value) {
  const range = q("#aUpThumbRange");
  const max = Number(range?.max || 0);

  let n = Number(value);
  if (!Number.isFinite(n)) n = 0;
  if (n < 0) n = 0;
  if (max > 0 && n > max) n = max;

  return Number(n.toFixed(1));
}

function syncThumbNumberToRange() {
  const time = q("#aUpThumbTime");
  const range = q("#aUpThumbRange");

  const t = clampThumbTime(time.value);
  time.value = String(t);

  if (range) range.value = String(t);

  clearUploadThumbnailOnly();
}

function syncThumbRangeToNumber() {
  const time = q("#aUpThumbTime");
  const range = q("#aUpThumbRange");

  const t = clampThumbTime(range.value);
  range.value = String(t);

  if (time) time.value = String(t);

  clearUploadThumbnailOnly();
}

async function useCurrentVideoTimeForThumbnail() {
  const video = q("#aUpVideoPreview");
  if (!video || !video.src) {
    setText("aUpStatus", "Escolhe um vídeo primeiro.");
    return;
  }

  const t = clampThumbTime(video.currentTime || 0);

  q("#aUpThumbTime").value = String(t);
  q("#aUpThumbRange").value = String(t);

  await previewUploadVideoThumbnail();
}

function captureVideoFrame(source, timeSeconds) {
  return new Promise((resolve, reject) => {
    if (!source) {
      reject(new Error("Escolhe um vídeo primeiro."));
      return;
    }

    const isBlob = source instanceof Blob || source instanceof File;
    const objectUrl = isBlob ? URL.createObjectURL(source) : null;
    const src = objectUrl || resolveUrl(source);

    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    // Safari is more reliable if the video element is actually in the DOM.
    video.style.position = "fixed";
    video.style.left = "-99999px";
    video.style.top = "0";
    video.style.width = "2px";
    video.style.height = "2px";
    video.style.opacity = "0";
    video.style.pointerEvents = "none";
    document.body.appendChild(video);

    let finished = false;

    const cleanup = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
    };

    const fail = (msg) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error(msg));
    };

    const waitForEvent = (eventName, timeoutMs = 8000) => {
      return new Promise((res, rej) => {
        const timer = setTimeout(() => {
          video.removeEventListener(eventName, ok);
          rej(new Error(`Timeout ao esperar por ${eventName}.`));
        }, timeoutMs);

        const ok = () => {
          clearTimeout(timer);
          video.removeEventListener(eventName, ok);
          res();
        };

        video.addEventListener(eventName, ok, { once: true });
      });
    };

    const waitForDecodedFrame = () => {
      return new Promise((res) => {
        if ("requestVideoFrameCallback" in video) {
          video.requestVideoFrameCallback(() => {
            setTimeout(res, 80);
          });
        } else {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setTimeout(res, 120);
            });
          });
        }
      });
    };

    const draw = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;

      if (!w || !h) {
        fail("Não foi possível ler a imagem do vídeo.");
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            fail("Não foi possível criar a thumbnail.");
            return;
          }

          finished = true;
          cleanup();
          resolve(blob);
        },
        "image/jpeg",
        0.92
      );
    };

    video.onerror = () => fail("Erro ao processar o vídeo.");

    (async () => {
      try {
        video.src = src;
        video.load();

        await waitForEvent("loadedmetadata");

        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        let safeTime = Number(timeSeconds) || 0;

        if (safeTime < 0) safeTime = 0;

        // Avoid frame 0 because many phone videos start with a black frame.
        if (safeTime === 0 && duration > 0.3) safeTime = 0.2;

        if (duration > 0 && safeTime >= duration) {
          safeTime = Math.max(0, duration - 0.2);
        }

        video.currentTime = safeTime;

        await waitForEvent("seeked");
        await waitForDecodedFrame();

        draw();
      } catch (e) {
        fail(e.message || "Erro ao gerar thumbnail.");
      }
    })();
  });
}

async function previewUploadVideoThumbnail() {
  const file = q("#aUpFile")?.files?.[0];
  const time = clampThumbTime(q("#aUpThumbTime")?.value || 0);

  if (!file) {
    setText("aUpStatus", "Escolhe um vídeo primeiro.");
    return;
  }

  try {
    setText("aUpStatus", "A gerar thumbnail...");

    uploadThumbBlob = await captureVideoFrame(file, time);

    if (uploadThumbPreviewUrl) {
      URL.revokeObjectURL(uploadThumbPreviewUrl);
    }

    uploadThumbPreviewUrl = URL.createObjectURL(uploadThumbBlob);

    const preview = q("#aThumbPreview");
    preview.src = uploadThumbPreviewUrl;
    preview.style.display = "block";

    setText("aUpStatus", "Thumbnail pronta.");
  } catch (e) {
    setText("aUpStatus", `Erro: ${e.message}`);
  }
}

/* ----------------- Auto-scroll while dragging ----------------- */
let __dragScrollRAF = null;
let __dragScrollY = 0;

function startDragAutoScroll() {
  if (__dragScrollRAF) return;

  const step = () => {
    if (!dragEl) {
      stopDragAutoScroll();
      return;
    }

    if (__dragScrollY !== 0) {
      window.scrollBy({ top: __dragScrollY, left: 0, behavior: "auto" });
    }

    __dragScrollRAF = requestAnimationFrame(step);
  };

  __dragScrollRAF = requestAnimationFrame(step);
}

function stopDragAutoScroll() {
  if (__dragScrollRAF) cancelAnimationFrame(__dragScrollRAF);
  __dragScrollRAF = null;
  __dragScrollY = 0;
}

function updateDragAutoScroll(clientY) {
  const margin = 90;
  const maxSpeed = 24;
  const vh = window.innerHeight;

  if (clientY < margin) {
    const t = (margin - clientY) / margin;
    __dragScrollY = -Math.ceil(maxSpeed * t);
  } else if (clientY > vh - margin) {
    const t = (clientY - (vh - margin)) / margin;
    __dragScrollY = Math.ceil(maxSpeed * t);
  } else {
    __dragScrollY = 0;
  }
}

/* ----------------- Cache + enhance ----------------- */
const boxCache = new Map();

async function refreshCacheAll() {
  const tasks = getBoxes().map(async (box) => {
    const items = await fetchJson(box.dataset.endpoint);
    const map = new Map();

    for (const it of items) {
      map.set(String(it.id), it);
    }

    boxCache.set(box.id, map);
  });

  await Promise.all(tasks);
}

function makeDraggable(el) {
  el.draggable = true;

  el.addEventListener("dragstart", (e) => {
    dragEl = el;
    dragOriginBoxId = el.closest(".box")?.id || null;
    el.classList.add("dragging");

    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", el.dataset.id || "");

    startDragAutoScroll();
  });

  el.addEventListener("drag", (e) => {
    if (typeof e.clientY === "number" && e.clientY > 0) {
      updateDragAutoScroll(e.clientY);
    }
  });

  el.addEventListener("dragend", () => {
    el.classList.remove("dragging");
    dragEl = null;
    dragOriginBoxId = null;

    stopDragAutoScroll();
    setDirty(true);
  });
}

function getDragAfterElement(container, y) {
  const els = [
    ...container.querySelectorAll(".image-container:not(.dragging):not(.add-tile)"),
  ];

  return els.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }

      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

function ensureAddTile(box) {
  const col1 = box.querySelector(".dream");
  if (!col1) return;
  if (col1.querySelector(".add-tile")) return;

  const tile = document.createElement("div");
  tile.className = "image-container add-tile";

  let label;
  if (box.dataset.kind === "fotografia") {
    label = "➕ Adicionar nova fotografia";
  } else if (isVideoKind(box.dataset.kind)) {
    label = "➕ Adicionar novo vídeo";
  } else {
    label = "➕ Adicionar nova obra";
  }

  tile.innerHTML = `${label}<br><small>(upload)</small>`;

  tile.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openUploadModalForBox(box);
  });

  col1.insertBefore(tile, col1.firstChild);
}

function ensureEditBadges(box) {
  for (const node of box.querySelectorAll(".image-container")) {
    if (node.classList.contains("add-tile")) continue;
    if (node.querySelector(".admin-badge")) continue;

    const badge = document.createElement("div");
    badge.className = "admin-badge";
    badge.textContent = "✎";

    node.appendChild(badge);
  }
}

function setupDropZones(box) {
  if (box.dataset.adminDropzones === "1") return;
  box.dataset.adminDropzones = "1";

  for (const colEl of box.querySelectorAll(".dream")) {
    colEl.addEventListener("dragover", (e) => {
      if (!dragEl) return;
      if ((colEl.closest(".box")?.id || null) !== dragOriginBoxId) return;

      e.preventDefault();
      updateDragAutoScroll(e.clientY);

      const after = getDragAfterElement(colEl, e.clientY);
      const addTile = colEl.querySelector(".add-tile");

      if (addTile && dragEl === addTile) return;

      if (after == null) colEl.appendChild(dragEl);
      else colEl.insertBefore(dragEl, after);
    });
  }
}

function enhanceBox(box) {
  ensureAddTile(box);
  ensureEditBadges(box);
  setupDropZones(box);

  for (const el of box.querySelectorAll(".image-container")) {
    if (el.classList.contains("add-tile")) continue;
    if (el.dataset.adminDraggable === "1") continue;

    el.dataset.adminDraggable = "1";
    makeDraggable(el);

    const img = el.querySelector("img");
    if (img) {
      img.draggable = false;
      img.addEventListener("dragstart", (ev) => ev.preventDefault());
    }

    const video = el.querySelector("video");
    if (video) {
      video.draggable = false;
      video.addEventListener("dragstart", (ev) => ev.preventDefault());
    }
  }
}

function enhanceBoxWithRetry(box, tries = 0) {
  if (!box.querySelector(".dream")) {
    if (tries < 25) setTimeout(() => enhanceBoxWithRetry(box, tries + 1), 80);
    return;
  }

  enhanceBox(box);
}

function enhanceAllBoxes() {
  for (const box of getBoxes()) {
    enhanceBoxWithRetry(box);
  }
}

/* ----------------- Admin click interception (edit) ----------------- */
let __adminCaptureInstalled = false;

const adminCaptureClickHandler = (e) => {
  if (!isAdminUrl || !adminOn) return;

  const container = e.target.closest(".image-container");
  if (!container) return;
  if (container.classList.contains("add-tile")) return;

  e.preventDefault();
  e.stopPropagation();

  const box = container.closest(".box");
  const id = container.dataset.id;

  if (box && id) openEditModal(box.id, id);
};

function installAdminCapture() {
  if (__adminCaptureInstalled) return;

  document.addEventListener("click", adminCaptureClickHandler, true);
  __adminCaptureInstalled = true;
}

function uninstallAdminCapture() {
  if (!__adminCaptureInstalled) return;

  document.removeEventListener("click", adminCaptureClickHandler, true);
  __adminCaptureInstalled = false;
}

/* ----------------- turn on/off ----------------- */
async function turnOnAdmin() {
  adminOn = true;
  document.body.classList.add("admin-on");
  show(q("#adminToolbar"), true);
  setDirty(false);

  keepRewritingNavForAWhile();

  try {
    await refreshCacheAll();
    enhanceAllBoxes();
  } catch (e) {
    setText("adminToolbarStatus", `Erro: ${e.message}`);
  }
}

async function turnOffAdmin() {
  adminOn = false;
  uninstallAdminCapture();
  setDirty(false);

  document.body.classList.remove("admin-on");
  show(q("#adminToolbar"), false);

  for (const t of qa(".add-tile")) t.remove();
  for (const b of qa(".admin-badge")) b.remove();

  for (const el of qa(".image-container")) {
    el.draggable = false;
    delete el.dataset.adminDraggable;
  }
}

/* ----------------- Save/Cancel reorder ----------------- */
function getOrderStateForBox(box) {
  const cols = [...box.querySelectorAll(".dream")];
  const items = [];

  cols.forEach((colEl, idx) => {
    const ids = [...colEl.querySelectorAll(".image-container")]
      .filter((n) => !n.classList.contains("add-tile"))
      .map((n) => n.dataset.id);

    ids.forEach((id, j) => {
      items.push({
        id,
        col: idx + 1,
        col_order: j + 1,
      });
    });
  });

  return items;
}

async function saveAll() {
  try {
    ensureLoggedIn();
  } catch {
    redirectToCentralLogin();
    return;
  }

  setText("adminToolbarStatus", "A guardar...");

  const fotosItems = [];
  const pinturasItems = [];
  const videosItems = [];

  for (const box of getBoxes()) {
    const kind = box.dataset.kind;
    const items = getOrderStateForBox(box);

    if (kind === "fotografia") {
      const category = box.dataset.category || null;

      for (const it of items) {
        fotosItems.push({ ...it, category });
      }
    } else if (isVideoKind(kind)) {
      for (const it of items) {
        videosItems.push(it);
      }
    } else {
      for (const it of items) {
        pinturasItems.push({ ...it, type: kind });
      }
    }
  }

  try {
    if (fotosItems.length) {
      await fetchJson("/api/admin/reorder/fotos", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ items: fotosItems }),
      });
    }

    if (pinturasItems.length) {
      await fetchJson("/api/admin/reorder/pinturas", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ items: pinturasItems }),
      });
    }

    if (videosItems.length) {
      await fetchJson("/api/admin/reorder/videos", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ items: videosItems }),
      });
    }

    setDirty(false);
    setText("adminToolbarStatus", "Guardado.");

    await refreshAllBoxes();
  } catch (e) {
    setText("adminToolbarStatus", `Erro: ${e.message}`);
  }
}

async function cancelAll() {
  setText("adminToolbarStatus", "A reverter...");
  setDirty(false);

  await refreshAllBoxes();

  setText("adminToolbarStatus", "");
}

async function refreshAllBoxes() {
  const tasks = getBoxes().map(async (box) => {
    const overlayMode = box.dataset.overlay || "none";

    await renderBox({
      boxId: box.id,
      endpoint: box.dataset.endpoint,
      overlayMode,
    });
  });

  await Promise.all(tasks);

  if (adminOn) {
    await refreshCacheAll();
    enhanceAllBoxes();
    keepRewritingNavForAWhile();
  }
}

/* ----------------- Edit modal actions ----------------- */
async function openEditModal(boxId, itemId) {
  ensureModals();

  const box = document.getElementById(boxId);
  if (!box) return;

  const kind = box.dataset.kind;
  let item = boxCache.get(boxId)?.get(String(itemId)) || null;

  if (!item) {
    try {
      const items = await fetchJson(box.dataset.endpoint);
      const map = new Map();

      for (const it of items) {
        map.set(String(it.id), it);
      }

      boxCache.set(boxId, map);
      item = map.get(String(itemId)) || null;
    } catch {}
  }

  if (!item) return;

  q("#aEditBoxId").value = boxId;
  q("#aEditKind").value = kind;
  q("#aEditId").value = String(item.id);
  q("#aEditTitle").value = item.title || "";
  q("#aEditYear").value = item.year ?? "";

  const imgPreview = q("#aEditPreview");
  const videoPreview = q("#aEditVideoPreview");

  if (isVideoKind(kind)) {
    imgPreview.style.display = "none";
    imgPreview.removeAttribute("src");

    videoPreview.style.display = "block";
    videoPreview.src = resolveUrl(item.url);
  } else {
    stopEditPreviewVideo();

    videoPreview.style.display = "none";
    imgPreview.style.display = "block";
    imgPreview.src = resolveUrl(item.url);
  }

  const yearWrap = q("#aEditYearWrap");
  const catWrap = q("#aEditCategoryWrap");
  const paintWrap = q("#aEditPaintFields");
  const videoWrap = q("#aEditVideoFields");

  if (kind === "fotografia") {
    yearWrap.style.display = "";
    catWrap.style.display = "";
    paintWrap.style.display = "none";
    videoWrap.style.display = "none";

    q("#aEditCategory").value = item.category || box.dataset.category || "tema_livre";
  } else if (isVideoKind(kind)) {
      clearEditThumbnailOnly();

      imgPreview.style.display = "none";
      imgPreview.removeAttribute("src");

      videoPreview.style.display = "block";
      videoPreview.crossOrigin = "anonymous";
      videoPreview.src = resolveUrl(item.url);

      q("#aEditThumbTime").value = String(item.thumbnail_time ?? 0);
      q("#aEditThumbRange").value = String(item.thumbnail_time ?? 0);
      q("#aEditThumbRange").disabled = true;
      q("#aEditThumbRange").max = "0";
      q("#aEditThumbTime").removeAttribute("max");

      videoPreview.onloadedmetadata = () => {
        const duration = Number.isFinite(videoPreview.duration) ? videoPreview.duration : 0;
        const max = Math.max(0, duration).toFixed(1);

        q("#aEditThumbRange").max = max;
        q("#aEditThumbRange").disabled = false;
        q("#aEditThumbTime").max = max;

        setText("aEditThumbHint", `Duração: ${max}s. Escolhe outro momento para trocar a thumbnail.`);
      };
  } else {
    yearWrap.style.display = "";
    catWrap.style.display = "none";
    paintWrap.style.display = "";
    videoWrap.style.display = "none";

    q("#aEditTechnique").value = item.technique || "";
    q("#aEditDimensions").value = item.dimensions || "";
    q("#aEditType").value = item.type || kind;
  }

  setText("aEditStatus", "");
  show(q("#adminEditModal"), true);
}

async function saveEdit() {
  try {
    ensureLoggedIn();
  } catch {
    redirectToCentralLogin();
    return;
  }

  const id = q("#aEditId").value;
  const kind = q("#aEditKind").value;
  const boxId = q("#aEditBoxId").value;

  setText("aEditStatus", "A guardar...");

  try {
    if (kind === "fotografia") {
      const payload = {
        title: q("#aEditTitle").value || null,
        year: q("#aEditYear").value ? Number(q("#aEditYear").value) : null,
        category: q("#aEditCategory").value || null,
      };

      await fetchJson(`/api/admin/fotos/${id}`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify(payload),
      });
    } else if (isVideoKind(kind)) {
      const payload = {
        title: q("#aEditTitle").value || null,
        published_date: q("#aEditPublishedDate").value || null,
      };

      await fetchJson(`/api/admin/videos/${id}`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify(payload),
      });

      if (editThumbBlob) {
        const fd = new FormData();
        const thumbTime = clampEditThumbTime(q("#aEditThumbTime").value || 0);

        fd.append("thumbnail_time", String(thumbTime));
        fd.append("thumbnail", editThumbBlob, "thumbnail.jpg");

        const res = await fetch(`${apiBase()}/api/admin/videos/${id}/thumbnail`, {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
          body: fd,
        });

        const ct = res.headers.get("content-type") || "";
        const data = ct.includes("application/json") ? await res.json() : await res.text();

        if (!res.ok) {
          const msg = data?.detail ? data.detail : typeof data === "string" ? data : `HTTP ${res.status}`;
          throw new Error(msg);
        }
      }
    } else {
      const payload = {
        title: q("#aEditTitle").value || null,
        year: q("#aEditYear").value ? Number(q("#aEditYear").value) : null,
        technique: q("#aEditTechnique").value || null,
        dimensions: q("#aEditDimensions").value || null,
        type: q("#aEditType").value || kind,
      };

      await fetchJson(`/api/admin/pinturas/${id}`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify(payload),
      });
    }

    stopEditPreviewVideo();
    show(q("#adminEditModal"), false);

    await refreshAllBoxes();

    const b = document.getElementById(boxId);
    if (b) {
      const items = await fetchJson(b.dataset.endpoint);
      const map = new Map();

      for (const it of items) {
        map.set(String(it.id), it);
      }

      boxCache.set(boxId, map);
    }
  } catch (e) {
    setText("aEditStatus", `Erro: ${e.message}`);
  }
}

async function deleteFromEdit() {
  try {
    ensureLoggedIn();
  } catch {
    redirectToCentralLogin();
    return;
  }

  const kind = q("#aEditKind").value;
  const confirmText = isVideoKind(kind) ? "Apagar este vídeo?" : "Apagar esta imagem?";

  if (!confirm(confirmText)) return;

  const id = q("#aEditId").value;

  setText("aEditStatus", "A apagar...");

  try {
    const endpoint =
      kind === "fotografia"
        ? `/api/admin/fotos/${id}`
        : isVideoKind(kind)
          ? `/api/admin/videos/${id}`
          : `/api/admin/pinturas/${id}`;

    await fetchJson(endpoint, {
      method: "DELETE",
      headers: authHeaders(false),
    });

    stopEditPreviewVideo();
    show(q("#adminEditModal"), false);

    await refreshAllBoxes();
  } catch (e) {
    setText("aEditStatus", `Erro: ${e.message}`);
  }
}

/* ----------------- Upload ----------------- */
function openUploadModalForBox(box) {
  ensureModals();

  try {
    ensureLoggedIn();
  } catch {
    redirectToCentralLogin();
    return;
  }

  resetUploadVideoTools();

  const kind = box.dataset.kind;
  const category = box.dataset.category || null;
  const videoMode = isVideoKind(kind);

  q("#aUpKind").value = kind;
  q("#aUpCategory").value = category || "";
  q("#aUpTitle").value = "";
  q("#aUpYear").value = "";
  q("#aUpPublishedDate").value = "";
  q("#aUpCol").value = "1";
  q("#aUpFile").value = "";

  q("#aUpCategoryWrap").style.display = kind === "fotografia" ? "" : "none";
  q("#aUpPaintFields").style.display = kind !== "fotografia" && !videoMode ? "" : "none";
  q("#aUpPublishedDateWrap").style.display = videoMode ? "" : "none";
  q("#aUpYearWrap").style.display = videoMode ? "none" : "";
  q("#aUpVideoThumbFields").style.display = videoMode ? "" : "none";

  if (kind === "fotografia") {
    q("#aUpModalTitle").textContent = "Adicionar nova fotografia";
    q("#aUpFileLabel").textContent = "Imagem";
    q("#aUpFile").accept = "image/*";
    q("#aUpCategorySelect").value = category || "tema_livre";
  } else if (videoMode) {
    q("#aUpModalTitle").textContent = "Adicionar novo vídeo";
    q("#aUpFileLabel").textContent = "Vídeo";
    q("#aUpFile").accept = "video/mp4,video/webm,video/quicktime,.mov,.m4v";
  } else {
    q("#aUpModalTitle").textContent = "Adicionar nova obra";
    q("#aUpFileLabel").textContent = "Imagem";
    q("#aUpFile").accept = "image/*";

    q("#aUpTechnique").value = "";
    q("#aUpDimensions").value = "";
    q("#aUpType").value = kind;
  }

  setText("aUpStatus", "");
  show(q("#adminUploadModal"), true);
}

async function doUpload() {
  try {
    ensureLoggedIn();
  } catch {
    redirectToCentralLogin();
    return;
  }

  setText("aUpStatus", "A enviar...");

  const kind = q("#aUpKind").value;
  const videoMode = isVideoKind(kind);
  const col = q("#aUpCol").value;
  const title = q("#aUpTitle").value;
  const year = q("#aUpYear").value;
  const file = q("#aUpFile").files[0];

  if (!file) {
    setText("aUpStatus", videoMode ? "Escolhe um vídeo." : "Escolhe uma imagem.");
    return;
  }

  const fd = new FormData();
  fd.append("col", col);

  if (title && title.trim()) {
    fd.append("title", title.trim());
  }

  if (!videoMode && year) {
    fd.append("year", year);
  }

  fd.append("file", file);

  let endpoint;

  if (kind === "fotografia") {
    const cat = q("#aUpCategorySelect").value;
    fd.append("category", cat);

    endpoint = "/api/admin/upload/foto";
  } else if (videoMode) {
    const publishedDate = q("#aUpPublishedDate").value;
    const thumbTime = clampThumbTime(q("#aUpThumbTime").value || 0);

    if (publishedDate) {
      fd.append("published_date", publishedDate);
    }

    setText("aUpStatus", "A gerar thumbnail...");

    const thumbBlob = await captureVideoFrame(file, thumbTime);

    fd.append("thumbnail_time", String(thumbTime));
    fd.append("thumbnail", thumbBlob, "thumbnail.jpg");

    endpoint = "/api/admin/upload/video";
  } else {
    const type = q("#aUpType").value;

    fd.append("type", type);
    fd.append(
      "technique",
      q("#aUpTechnique").value || (type === "mista" ? "Técnica mista" : "")
    );
    fd.append("dimensions", q("#aUpDimensions").value || "");

    endpoint = "/api/admin/upload/pintura";
  }

  try {
    setText("aUpStatus", "A enviar...");

    const res = await fetch(`${apiBase()}${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
      body: fd,
    });

    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json() : await res.text();

    if (!res.ok) {
      const msg = data?.detail
        ? data.detail
        : typeof data === "string"
          ? data
          : `HTTP ${res.status}`;

      setText("aUpStatus", `Erro: ${msg}`);
      return;
    }

    setText("aUpStatus", "Upload concluído.");

    resetUploadVideoTools();
    show(q("#adminUploadModal"), false);

    await refreshAllBoxes();
  } catch (e) {
    setText("aUpStatus", `Erro: ${e.message}`);
  }
}

/* ----------------- Login redirect + logout ----------------- */
function redirectToCentralLogin() {
  const next = encodeURIComponent(
    window.location.pathname + window.location.search + window.location.hash
  );

  window.location.href = `/admin/?next=${next}`;
}

async function logout() {
  idToken = null;

  STORE.removeItem(SS_TOKEN_KEY);
  STORE.removeItem(SS_ON_KEY);

  await turnOffAdmin();

  const u = new URL(location.href);
  u.searchParams.delete("admin");

  location.href = u.pathname + (u.search ? u.search : "") + u.hash;
}

/* ----------------- Boot ----------------- */
async function init() {
  if (!getBoxes().length) return;

  const paramsNow = new URL(location.href).searchParams;
  const wantAdminNow = paramsNow.get("admin") === "1";

  if (!wantAdminNow) {
    if (STORE.getItem(SS_TOKEN_KEY) && STORE.getItem(SS_ON_KEY) === "1") {
      guardAdminParam();
    }

    return;
  }

  ensureToolbar();
  ensureModals();

  if (!idToken) {
    redirectToCentralLogin();
    return;
  }

  try {
    await fetchJson("/api/admin/me", {
      method: "GET",
      headers: authHeaders(false),
    });

    STORE.setItem(SS_ON_KEY, "1");

    installAdminCapture();
    await turnOnAdmin();
  } catch (e) {
    idToken = null;

    STORE.removeItem(SS_TOKEN_KEY);
    STORE.removeItem(SS_ON_KEY);

    redirectToCentralLogin();
  }
}

document.addEventListener("DOMContentLoaded", init);