const STORAGE_KEY = 'jldv1508EditUnlocked';
const CURRENT_PAGE = document.body.dataset.catalogTitle || document.title || 'jldv1508';
const CATALOG_URL = document.body.dataset.catalogUrl || '';
const PUBLIC_STORAGE_KEY = document.body.dataset.publicStorageKey || '';

let catalogCache = null;

function getConfig() {
  return fetch('/api/edit-credentials', { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`edit-credentials:${response.status}`);
      return response.json();
    })
    .then(payload => ({
      user: String(payload?.user || ''),
      password: String(payload?.password || ''),
    }));
}

function getMount() {
  return document.querySelector('.home-main, .blog-main, .catalog-shell, main');
}

function getCatalogItems() {
  if (catalogCache) return Promise.resolve(catalogCache);
  if (!CATALOG_URL) return Promise.resolve([]);
  return fetch(CATALOG_URL, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error(`catalog:${response.status}`);
      return response.json();
    })
    .then(data => {
      catalogCache = Array.isArray(data) ? data : [];
      return catalogCache;
    });
}

function csvEscape(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildCsv(items) {
  const headers = ['codigo', 'tipo', 'material', 'color', 'precio_eur', 'estado', 'descripcion', 'archivo'];
  const lines = [headers.join(',')];
  items.forEach(item => {
    lines.push(headers.map(key => csvEscape(item?.[key] ?? '')).join(','));
  });
  return lines.join('\n');
}

function buildJson(items) {
  return JSON.stringify({ items, exportedAt: new Date().toISOString() }, null, 2);
}

function downloadHtmlSnapshot() {
  downloadFile(
    `${location.pathname.replaceAll('/', '-') || 'index'}.html`,
    '<!doctype html>\n' + document.documentElement.outerHTML,
    'text/html;charset=utf-8',
  );
}

async function downloadCsvSnapshot() {
  const items = await getCatalogItems();
  downloadFile('catalogo-publico.csv', buildCsv(items), 'text/csv;charset=utf-8');
}

async function downloadJsonSnapshot() {
  const items = await getCatalogItems();
  downloadFile('catalogo-publico.json', buildJson(items), 'application/json;charset=utf-8');
}

async function updatePublicCatalog() {
  if (!PUBLIC_STORAGE_KEY || !CATALOG_URL) return false;
  const items = await getCatalogItems();
  localStorage.setItem(PUBLIC_STORAGE_KEY, JSON.stringify({ items, updatedAt: new Date().toISOString() }));
  return true;
}

function restorePublicCatalog() {
  if (!PUBLIC_STORAGE_KEY) return false;
  const stored = localStorage.getItem(PUBLIC_STORAGE_KEY);
  if (!stored) return false;
  try {
    const payload = JSON.parse(stored);
    if (!Array.isArray(payload?.items)) return false;
    catalogCache = payload.items;
    return true;
  } catch {
    return false;
  }
}

function isUnlocked() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function setUnlocked(value) {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, '1');
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function createPanel() {
  const existing = document.querySelector('#publicEditPanel');
  if (existing) return existing;

  const panel = document.createElement('section');
  panel.id = 'publicEditPanel';
  panel.className = 'public-edit-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="public-edit-head">
      <div>
        <p class="public-edit-kicker">Cabecera de edicion</p>
        <h2>${CURRENT_PAGE}</h2>
      </div>
      <span class="public-edit-state" data-edit-state>Bloqueada</span>
    </div>
    <div class="public-edit-toolbar" data-edit-toolbar hidden>
      <div class="public-edit-tabs">
        <a class="public-edit-tab" href="/bisuteria">Bisuteria</a>
        <a class="public-edit-tab" href="/conchas">Conchas</a>
        <a class="public-edit-tab" href="/blog">Blog</a>
      </div>
      <div class="public-edit-actions public-edit-actions--toolbar">
        <button type="button" data-edit-save>Guardar en navegador</button>
        <button type="button" data-edit-csv>Exportar CSV</button>
        <button type="button" data-edit-public>Actualizar publico</button>
        <button type="button" data-edit-json>Descargar catalogo publico</button>
        <button type="button" data-edit-backup>Descargar respaldo</button>
        <button type="button" data-edit-html>Descargar HTML editable</button>
        <button type="button" data-edit-restore>Restaurar publico</button>
      </div>
    </div>
    <form class="public-edit-form" data-edit-form>
      <label>
        <span>Usuario</span>
        <input name="user" autocomplete="username" placeholder="admin">
      </label>
      <label>
        <span>Contraseña</span>
        <input name="password" type="password" autocomplete="current-password" placeholder="password">
      </label>
      <div class="public-edit-actions">
        <button type="submit">Abrir edicion</button>
        <button type="button" data-edit-close>Cerrar</button>
      </div>
    </form>
    <div class="public-edit-note" data-edit-links hidden>Edicion activa sobre la hoja publica.</div>
  `;

  const mount = getMount();
  if (mount) {
    mount.insertAdjacentElement('beforebegin', panel);
  } else {
    document.body.appendChild(panel);
  }

  const form = panel.querySelector('[data-edit-form]');
  const closeButton = panel.querySelector('[data-edit-close]');
  const state = panel.querySelector('[data-edit-state]');
  const note = panel.querySelector('[data-edit-links]');
  const toolbar = panel.querySelector('[data-edit-toolbar]');
  const saveButton = panel.querySelector('[data-edit-save]');
  const csvButton = panel.querySelector('[data-edit-csv]');
  const publicButton = panel.querySelector('[data-edit-public]');
  const jsonButton = panel.querySelector('[data-edit-json]');
  const backupButton = panel.querySelector('[data-edit-backup]');
  const htmlButton = panel.querySelector('[data-edit-html]');
  const restoreButton = panel.querySelector('[data-edit-restore]');

  const sync = () => {
    const unlocked = isUnlocked();
    panel.hidden = !panel.classList.contains('is-open');
    state.textContent = unlocked ? 'Activa' : 'Bloqueada';
    toolbar.hidden = !unlocked;
    note.hidden = !unlocked;
    if (unlocked) {
      const userInput = form.querySelector('[name="user"]');
      const passInput = form.querySelector('[name="password"]');
      if (userInput) userInput.value = '';
      if (passInput) passInput.value = '';
    }
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    let config;
    try {
      config = await getConfig();
    } catch {
      state.textContent = 'No se pueden cargar credenciales';
      panel.classList.add('is-open');
      panel.hidden = false;
      return;
    }
    const ok = String(data.get('user') || '') === config.user && String(data.get('password') || '') === config.password;
    if (!ok) {
      state.textContent = 'Credenciales incorrectas';
      panel.classList.add('is-open');
      panel.hidden = false;
      toolbar.hidden = true;
      note.hidden = true;
      return;
    }
    setUnlocked(true);
    panel.classList.add('is-open');
    sync();
  });

  closeButton.addEventListener('click', () => {
    setUnlocked(false);
    panel.classList.remove('is-open');
    panel.hidden = true;
  });

  saveButton?.addEventListener('click', () => {
    panel.classList.add('is-open');
    sync();
  });
  csvButton?.addEventListener('click', () => {
    downloadCsvSnapshot();
  });
  publicButton?.addEventListener('click', async () => {
    const ok = await updatePublicCatalog();
    state.textContent = ok ? 'Publico actualizado' : 'Sin catalogo publico';
    sync();
  });
  jsonButton?.addEventListener('click', () => {
    downloadJsonSnapshot();
  });
  backupButton?.addEventListener('click', () => {
    downloadJsonSnapshot();
  });
  htmlButton?.addEventListener('click', () => {
    downloadHtmlSnapshot();
  });
  restoreButton?.addEventListener('click', () => {
    const ok = restorePublicCatalog();
    state.textContent = ok ? 'Publico restaurado' : 'Sin respaldo';
    sync();
  });

  sync();
  return panel;
}

function togglePanel() {
  const panel = createPanel();
  const opened = panel.classList.toggle('is-open');
  panel.hidden = !opened && !isUnlocked();
  if (opened) {
    const input = panel.querySelector('[name="user"]');
    if (input) input.focus();
  }
}

function init() {
  document.querySelectorAll('.home-edit, .blog-edit, .catalog-edit').forEach(trigger => {
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.addEventListener('click', event => {
      event.preventDefault();
      togglePanel();
    });
    trigger.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        togglePanel();
      }
    });
  });

  if (isUnlocked()) {
    const panel = createPanel();
    panel.hidden = false;
    panel.classList.add('is-open');
    panel.querySelector('[data-edit-toolbar]').hidden = false;
    panel.querySelector('[data-edit-links]').hidden = false;
  }
}

init();
