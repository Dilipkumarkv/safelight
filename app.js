/* Safelight — image lab
   Everything client-side: IndexedDB for frames, a service worker for the shell,
   and Pollinations' public image endpoint for pixels. */

const API = 'https://image.pollinations.ai/prompt/';

const RATIOS = {
  '1:1': [768, 768],
  '3:4': [640, 854],
  '4:5': [672, 840],
  '16:9': [768, 432],
  '9:16': [432, 768],
};

const STORE = 'shots';
const DB_NAME = 'safelight';
const LS = {
  theme: 'safelight:theme',
  form: 'safelight:form',
};

/* ── Element handles ─────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const el = {
  form: $('composer'),
  prompt: $('prompt'),
  counter: $('counter'),
  presets: $('presets'),
  ratioGroup: $('ratioGroup'),
  countGroup: $('countGroup'),
  seed: $('seed'),
  dice: $('diceBtn'),
  status: $('status'),
  generate: $('generateBtn'),
  gallery: $('gallery'),
  empty: $('emptyState'),
  shotCount: $('shotCount'),
  filters: $('filters'),
  viewer: $('viewer'),
  viewerImg: $('viewerImg'),
  viewerMeta: $('viewerMeta'),
  viewerPrompt: $('viewerPrompt'),
  viewerFav: $('viewerFav'),
  viewerShare: $('viewerShare'),
  viewerDownload: $('viewerDownload'),
  viewerAgain: $('viewerAgain'),
  viewerDelete: $('viewerDelete'),
  viewerClose: $('viewerClose'),
  settings: $('settings'),
  settingsBtn: $('settingsBtn'),
  settingsClose: $('settingsClose'),
  themeGroup: $('themeGroup'),
  storageValue: $('storageValue'),
  appState: $('appState'),
  clearBtn: $('clearBtn'),
  installBtn: $('installBtn'),
  installBtn2: $('installBtn2'),
  toast: $('toast'),
};

/* ── Small helpers ───────────────────────────────────────── */
const randomSeed = () => Math.floor(Math.random() * 1_000_000);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

function ago(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

let toastTimer;
function toast(msg, ms = 2600) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms);
}

function setStatus(text, tone = '') {
  el.status.textContent = text;
  el.status.className = 'status' + (tone ? ' ' + tone : '');
}

/* ── IndexedDB ───────────────────────────────────────────── */
let dbPromise;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) {
          const s = d.createObjectStore(STORE, { keyPath: 'id' });
          s.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(mode) {
  const d = await db();
  return d.transaction(STORE, mode).objectStore(STORE);
}

const store = {
  async all() {
    const s = await tx('readonly');
    return new Promise((res, rej) => {
      const req = s.getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });
  },
  async put(rec) {
    const s = await tx('readwrite');
    return new Promise((res, rej) => {
      const req = s.put(rec);
      req.onsuccess = () => res(rec);
      req.onerror = () => rej(req.error);
    });
  },
  async del(id) {
    const s = await tx('readwrite');
    return new Promise((res, rej) => {
      const req = s.delete(id);
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
  },
  async clear() {
    const s = await tx('readwrite');
    return new Promise((res, rej) => {
      const req = s.clear();
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
    });
  },
};

/* ── State ───────────────────────────────────────────────── */
const state = {
  ratio: '1:1',
  count: 1,
  filter: 'all',
  shots: [],
  urls: new Map(),
  active: null,
  busy: false,
  deferredInstall: null,
};

function urlFor(rec) {
  let u = state.urls.get(rec.id);
  if (!u) {
    u = URL.createObjectURL(rec.blob);
    state.urls.set(rec.id, u);
  }
  return u;
}

/* ── Form persistence ────────────────────────────────────── */
function saveForm() {
  try {
    localStorage.setItem(LS.form, JSON.stringify({
      prompt: el.prompt.value,
      ratio: state.ratio,
      count: state.count,
      seed: el.seed.value,
    }));
  } catch {}
}

function restoreForm() {
  try {
    const f = JSON.parse(localStorage.getItem(LS.form) || '{}');
    if (f.prompt) el.prompt.value = f.prompt;
    if (f.seed) el.seed.value = f.seed;
    if (f.ratio && RATIOS[f.ratio]) setRadio(el.ratioGroup, f.ratio, (v) => { state.ratio = v; });
    if (f.count && [1, 2, 4].includes(Number(f.count))) {
      setRadio(el.countGroup, String(f.count), (v) => { state.count = Number(v); });
    }
  } catch {}
}

function setRadio(group, value, apply) {
  [...group.querySelectorAll('[role="radio"]')].forEach((b) => {
    const key = b.dataset.ratio || b.dataset.count || b.dataset.theme;
    const on = key === value;
    b.setAttribute('aria-checked', String(on));
    b.classList.toggle('on', on);
  });
  apply(value);
}

/* ── Textarea behaviour ──────────────────────────────────── */
function grow() {
  el.prompt.style.height = 'auto';
  el.prompt.style.height = clamp(el.prompt.scrollHeight, 84, 260) + 'px';
  el.counter.textContent = `${el.prompt.value.length}/800`;
}

/* ── Generation ──────────────────────────────────────────── */
function buildUrl(prompt, seed, [w, h]) {
  const p = encodeURIComponent(prompt);
  return `${API}${p}?width=${w}&height=${h}&seed=${seed}&nologo=true`;
}

async function fetchWithRetry(url, onRetry) {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, { mode: 'cors', cache: 'no-store' });
    if (res.ok) return res;
    if ((res.status === 429 || res.status === 503) && attempt < 2) {
      const wait = Number(res.headers.get('retry-after')) || 4 * (attempt + 1);
      onRetry(wait);
      await new Promise((r) => setTimeout(r, wait * 1000));
      attempt += 1;
      continue;
    }
    throw new Error(res.status === 429 ? 'Busy queue — try again in a moment.'
      : res.status === 451 || res.status === 403 ? 'That prompt was refused.'
      : `Server said ${res.status}.`);
  }
}

function cardShell(ratio) {
  const [w, h] = RATIOS[ratio] || [1, 1];
  const card = document.createElement('div');
  card.className = 'card skeleton';
  card.style.setProperty('--card-ratio', String(w / h));
  card.dataset.label = 'developing';
  return card;
}

async function generate() {
  const prompt = el.prompt.value.trim();
  if (!prompt) {
    el.prompt.focus();
    setStatus('Write something to develop first.', 'error');
    return;
  }
  if (state.busy) return;

  state.busy = true;
  el.generate.disabled = true;
  el.generate.classList.add('busy');
  el.generate.querySelector('.btn-label').textContent = 'Developing';

  const ratio = state.ratio;
  const [w, h] = RATIOS[ratio];
  const baseSeed = Number(el.seed.value) || randomSeed();
  if (!el.seed.value) el.seed.value = String(baseSeed);

  const skeleton = [];
  for (let i = 0; i < state.count; i++) {
    const node = cardShell(ratio);
    skeleton.push(node);
    el.gallery.prepend(node);
  }
  el.empty.hidden = true;

  const started = performance.now();
  const ticker = setInterval(() => {
    const s = Math.round((performance.now() - started) / 1000);
    setStatus(`Developing ${state.count === 1 ? 'frame' : state.count + ' frames'} · ${s}s`, 'busy');
  }, 500);
  setStatus('Contacting the lab…', 'busy');

  let done = 0;
  let failed = 0;

  try {
    await Promise.all(
      skeleton.map(async (node, i) => {
        const seed = baseSeed + i;
        try {
          const res = await fetchWithRetry(
            buildUrl(prompt, seed, [w, h]),
            (wait) => setStatus(`Queue is full — retrying in ${wait}s`, 'busy'),
          );
          const blob = await res.blob();
          if (!blob.type.startsWith('image/')) throw new Error('The lab sent something that is not an image.');

          const rec = {
            id: uid(),
            prompt,
            seed,
            ratio,
            w,
            h,
            favorite: false,
            createdAt: Date.now(),
            blob,
          };
          try {
            await store.put(rec);
          } catch (e) {
            if (e && e.name === 'QuotaExceededError') toast('Storage is full — delete a few frames.');
          }
          state.shots.unshift(rec);
          node.replaceWith(renderCard(rec));
          done += 1;
        } catch (err) {
          failed += 1;
          node.classList.remove('skeleton');
          node.classList.add('failed');
          node.removeAttribute('data-label');
          node.replaceChildren();
          const p = document.createElement('p');
          p.textContent = err.message || 'Failed';
          node.append(p);
        }
      }),
    );
  } catch (err) {
    failed += 1;
    setStatus(err.message || 'Something broke.', 'error');
  } finally {
    clearInterval(ticker);
    state.busy = false;
    el.generate.disabled = false;
    el.generate.classList.remove('busy');
    el.generate.querySelector('.btn-label').textContent = 'Develop';
    updateCounts();
    saveForm();
  }

  const secs = Math.round((performance.now() - started) / 1000);
  if (done && !failed) setStatus(`Done in ${secs}s · ${done} frame${done > 1 ? 's' : ''} kept below.`);
  else if (done) setStatus(`${done} developed, ${failed} refused in ${secs}s.`);
  else if (failed) setStatus('Nothing developed. Try again or change the prompt.', 'error');
}

/* ── Rendering ───────────────────────────────────────────── */
function visibleShots() {
  return state.filter === 'fav' ? state.shots.filter((s) => s.favorite) : state.shots;
}

function renderCard(rec) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'card';
  card.dataset.id = rec.id;
  card.style.setProperty('--card-ratio', String(rec.w / rec.h));
  card.setAttribute('aria-label', `Frame ${rec.seed}, ${rec.w} by ${rec.h}`);

  const img = document.createElement('img');
  img.src = urlFor(rec);
  img.alt = rec.prompt.slice(0, 120);
  img.loading = 'lazy';
  img.decoding = 'async';

  const meta = document.createElement('span');
  meta.className = 'card-meta';
  const seed = document.createElement('span');
  seed.className = 'card-seed';
  seed.textContent = `#${rec.seed}`;
  meta.append(seed);
  if (rec.favorite) {
    const heart = document.createElement('span');
    heart.className = 'card-fav';
    heart.textContent = '●';
    meta.append(heart);
  }

  card.append(img, meta);
  card.addEventListener('click', () => openViewer(rec.id));
  return card;
}

function renderGallery() {
  const shots = visibleShots();
  el.gallery.replaceChildren(...shots.map(renderCard));
  const isEmpty = shots.length === 0;
  el.empty.hidden = !isEmpty;
  if (isEmpty && state.filter === 'fav' && state.shots.length) {
    el.empty.querySelector('.empty-title').textContent = 'No kept frames yet.';
    el.empty.querySelector('.empty-copy').textContent = 'Tap a frame, then the heart to keep it.';
  } else if (isEmpty) {
    el.empty.querySelector('.empty-title').textContent = 'Nothing on the line yet.';
    el.empty.querySelector('.empty-copy').textContent = 'Try one of these to see how it behaves:';
  }
  updateCounts();
}

function updateCounts() {
  el.shotCount.textContent = String(state.shots.length);
  const kept = state.shots.filter((s) => s.favorite).length;
  el.storageValue.textContent = state.shots.length
    ? `${state.shots.length} frame${state.shots.length > 1 ? 's' : ''}${kept ? ` · ${kept} kept` : ''}`
    : 'Empty';
}

/* ── Viewer ──────────────────────────────────────────────── */
function openViewer(id) {
  const rec = state.shots.find((s) => s.id === id);
  if (!rec) return;
  state.active = rec;
  el.viewerImg.src = urlFor(rec);
  el.viewerImg.alt = rec.prompt;
  el.viewerPrompt.textContent = rec.prompt;
  el.viewerMeta.textContent = `${rec.w}×${rec.h} · seed ${rec.seed} · ${ago(rec.createdAt)}`;
  el.viewerFav.setAttribute('aria-pressed', String(!!rec.favorite));
  el.viewer.hidden = false;
  document.body.style.overflow = 'hidden';
  el.viewerClose.focus();
}

function closeViewer() {
  el.viewer.hidden = true;
  state.active = null;
  document.body.style.overflow = '';
}

async function toggleFavorite(rec) {
  if (!rec) return;
  rec.favorite = !rec.favorite;
  await store.put(rec);
  el.viewerFav.setAttribute('aria-pressed', String(rec.favorite));
  renderGallery();
  updateCounts();
  toast(rec.favorite ? 'Kept.' : 'Removed from kept.');
}

function fileName(rec) {
  return `safelight-${rec.seed}-${rec.w}x${rec.h}.jpg`;
}

async function download(rec) {
  const a = document.createElement('a');
  a.href = urlFor(rec);
  a.download = fileName(rec);
  a.click();
  toast('Saving…');
}

async function share(rec) {
  const file = new File([rec.blob], fileName(rec), { type: rec.blob.type || 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: rec.prompt });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  await download(rec);
}

async function removeShot(rec) {
  if (!rec) return;
  await store.del(rec.id);
  const u = state.urls.get(rec.id);
  if (u) URL.revokeObjectURL(u);
  state.urls.delete(rec.id);
  state.shots = state.shots.filter((s) => s.id !== rec.id);
  closeViewer();
  renderGallery();
  toast('Deleted.');
}

/* ── Settings / theme ────────────────────────────────────── */
function applyTheme(mode) {
  if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', mode);
  const meta = document.querySelector('meta[name="theme-color"]');
  const light = mode === 'light' || (mode === 'auto' && matchMedia('(prefers-color-scheme: light)').matches);
  if (meta) meta.setAttribute('content', light ? '#f6f3ec' : '#0c0d10');
  try { localStorage.setItem(LS.theme, mode); } catch {}
  setRadio(el.themeGroup, mode, () => {});
}

function openSettings() {
  el.settings.hidden = false;
  document.body.style.overflow = 'hidden';
  updateCounts();
  el.appState.textContent = window.matchMedia('(display-mode: standalone)').matches
    ? 'Installed · standalone' : 'Running in browser';
  el.settingsClose.focus();
}

function closeSettings() {
  el.settings.hidden = true;
  document.body.style.overflow = '';
}

/* ── Install ─────────────────────────────────────────────── */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.deferredInstall = e;
  el.installBtn.hidden = false;
  el.installBtn2.hidden = false;
});

async function promptInstall() {
  if (state.deferredInstall) {
    state.deferredInstall.prompt();
    const { outcome } = await state.deferredInstall.userChoice;
    if (outcome === 'accepted') toast('Installing…');
    state.deferredInstall = null;
    el.installBtn.hidden = true;
    el.installBtn2.hidden = true;
  } else {
    toast('Use your browser menu → Add to Home screen.');
  }
}

window.addEventListener('appinstalled', () => {
  el.installBtn.hidden = true;
  el.installBtn2.hidden = true;
  toast('Installed. Open it from your home screen.');
});

/* ── Wiring ──────────────────────────────────────────────── */
function wire() {
  el.prompt.addEventListener('input', () => { grow(); saveForm(); });
  el.prompt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      generate();
    }
  });

  el.form.addEventListener('submit', (e) => { e.preventDefault(); generate(); });

  el.presets.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const style = chip.dataset.style;
    const on = chip.getAttribute('aria-pressed') === 'true';
    let v = el.prompt.value;
    if (on) {
      v = v.replace(new RegExp('(^|[,;\\s]*)' + style.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '').trim();
      chip.setAttribute('aria-pressed', 'false');
    } else {
      v = v.trim();
      v = v ? `${v.replace(/[,\s]+$/, '')}, ${style}` : style;
      chip.setAttribute('aria-pressed', 'true');
    }
    el.prompt.value = v.replace(/\s{2,}/g, ' ').replace(/^[,\s]+/, '');
    grow();
    saveForm();
  });

  el.ratioGroup.addEventListener('click', (e) => {
    const b = e.target.closest('[role="radio"]');
    if (!b) return;
    setRadio(el.ratioGroup, b.dataset.ratio, (v) => { state.ratio = v; });
    saveForm();
  });

  el.countGroup.addEventListener('click', (e) => {
    const b = e.target.closest('[role="radio"]');
    if (!b) return;
    setRadio(el.countGroup, b.dataset.count, (v) => { state.count = Number(v); });
    saveForm();
  });

  el.dice.addEventListener('click', () => {
    el.seed.value = String(randomSeed());
    saveForm();
  });

  el.seed.addEventListener('change', () => {
    el.seed.value = String(clamp(Number(el.seed.value) || randomSeed(), 0, 999999));
    saveForm();
  });

  el.filters.addEventListener('click', (e) => {
    const b = e.target.closest('.filter');
    if (!b) return;
    state.filter = b.dataset.filter;
    [...el.filters.children].forEach((c) => {
      const on = c === b;
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', String(on));
    });
    renderGallery();
  });

  el.empty.addEventListener('click', (e) => {
    const b = e.target.closest('.example');
    if (!b) return;
    el.prompt.value = b.dataset.example;
    grow();
    saveForm();
    el.prompt.focus();
  });

  el.viewerClose.addEventListener('click', closeViewer);
  el.viewerFav.addEventListener('click', () => toggleFavorite(state.active));
  el.viewerDownload.addEventListener('click', () => state.active && download(state.active));
  el.viewerShare.addEventListener('click', () => state.active && share(state.active));
  el.viewerDelete.addEventListener('click', () => state.active && removeShot(state.active));
  el.viewerAgain.addEventListener('click', () => {
    if (!state.active) return;
    const { prompt } = state.active;
    closeViewer();
    el.prompt.value = prompt;
    el.seed.value = String(randomSeed());
    grow();
    generate();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!el.viewer.hidden) closeViewer();
      if (!el.settings.hidden) closeSettings();
    }
  });

  el.settingsBtn.addEventListener('click', openSettings);
  el.settingsClose.addEventListener('click', closeSettings);
  el.settings.addEventListener('click', (e) => { if (e.target === el.settings) closeSettings(); });

  el.themeGroup.addEventListener('click', (e) => {
    const b = e.target.closest('[role="radio"]');
    if (!b) return;
    applyTheme(b.dataset.theme);
  });

  el.clearBtn.addEventListener('click', async () => {
    await store.clear();
    state.shots.forEach((s) => {
      const u = state.urls.get(s.id);
      if (u) URL.revokeObjectURL(u);
    });
    state.urls.clear();
    state.shots = [];
    renderGallery();
    closeSettings();
    toast('Lab cleared.');
  });

  el.installBtn.addEventListener('click', promptInstall);
  el.installBtn2.addEventListener('click', promptInstall);

  window.addEventListener('online', () => setStatus('Back online.'));
  window.addEventListener('offline', () => setStatus('Offline — cached frames still open.', 'error'));
}

/* ── Boot ────────────────────────────────────────────────── */
async function boot() {
  let theme = 'auto';
  try { theme = localStorage.getItem(LS.theme) || 'auto'; } catch {}
  applyTheme(theme);
  restoreForm();
  grow();
  wire();

  // Keep a restored seed; only invent one when there is nothing to restore.
  if (!el.seed.value) el.seed.value = String(randomSeed());

  state.shots = (await store.all()).sort((a, b) => b.createdAt - a.createdAt);
  renderGallery();

  const display = window.matchMedia('(display-mode: standalone)').matches;
  setStatus(display ? 'Installed · ready.' : 'Ready when you are.');

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('sw.js');
    } catch (e) {
      console.warn('Service worker failed:', e);
    }
  }
}

boot();
