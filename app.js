// ─── Sesh Share Page ─────────────────────────────────────────────────────────
// Reads compressed session data from URL hash, renders the share page.
// Communicates with the Sesh Chrome extension for tab group support.

// TODO: Replace with actual extension ID after publishing to Chrome Web Store
const EXTENSION_ID = 'gpalkohoegdcceblmhibionnphpjnjfp';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function esc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ─── Chevron SVG ─────────────────────────────────────────────────────────────
const chevronSVG = `<svg class="chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

const externalLinkSVG = `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

// ─── Theme ───────────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('sesh-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  }
  updateToggle();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next === 'light' ? '' : 'dark');
  localStorage.setItem('sesh-theme', next);
  updateToggle();
}

function updateToggle() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  toggle.textContent = isDark ? '☾' : '☀';
}

// ─── Parse session data from URL hash ────────────────────────────────────────
function parseSession() {
  const hash = window.location.hash.slice(1);
  if (!hash) return null;

  try {
    const json = LZString.decompressFromEncodedURIComponent(hash);
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ─── Organize tabs by group ──────────────────────────────────────────────────
function getGroups(session) {
  const tabs = session.tabs || [];
  if (session.urls) {
    return [{ name: '', color: null, tabs: session.urls.map(u => ({ url: u })) }];
  }

  const groups = [];
  const seen = {};
  for (const tab of tabs) {
    const key = tab.groupName || '';
    if (!seen[key]) {
      seen[key] = { name: key, color: tab.groupColor || null, tabs: [] };
      groups.push(seen[key]);
    }
    seen[key].tabs.push(tab);
  }
  return groups;
}

// ─── Render ──────────────────────────────────────────────────────────────────
function render(session) {
  const groups = getGroups(session);
  const allTabs = session.tabs || session.urls?.map(u => ({ url: u })) || [];
  const groupCount = groups.filter(g => g.name).length;

  // Page title
  document.title = `${esc(session.name || 'Shared Session')} — Sesh`;

  // Hero
  document.getElementById('session-name').textContent = session.name || 'Shared Session';
  document.getElementById('shared-by').textContent = session.sender
    ? `${session.sender} shared tabs with you`
    : 'Someone shared tabs with you';

  // Timestamp
  if (session.ts) {
    document.getElementById('timestamp').textContent = `Shared ${formatTimeAgo(session.ts)}`;
  }

  // Card meta
  const metaParts = [`${allTabs.length} tab${allTabs.length !== 1 ? 's' : ''}`];
  if (groupCount > 0) metaParts.push(`${groupCount} group${groupCount !== 1 ? 's' : ''}`);
  document.getElementById('card-meta').textContent = metaParts.join(' · ');

  // Render groups
  const container = document.getElementById('groups-container');
  container.innerHTML = '';

  const groupStates = {};

  groups.forEach((group, i) => {
    if (i > 0) {
      container.appendChild(Object.assign(document.createElement('div'), { className: 'divider' }));
    }

    if (group.name) {
      const groupId = `group-${i}`;
      groupStates[groupId] = true; // expanded by default

      const groupEl = document.createElement('div');
      groupEl.className = 'group';
      groupEl.dataset.group = groupId;

      // Header
      const header = document.createElement('div');
      header.className = 'group-header';
      header.innerHTML = `${chevronSVG}<span class="count">${group.tabs.length}</span><span class="label">${esc(group.name)}</span>`;
      // Store toggle function globally with safe key
      const toggleKey = `_tg${i}`;
      window[toggleKey] = () => {
        groupStates[groupId] = !groupStates[groupId];
        renderGroupState(groupId, groupStates[groupId]);
        updateExpandAll(groupStates);
      };
      header.setAttribute('onclick', `window.${toggleKey}()`);
      groupEl.appendChild(header);

      // Tabs
      const tabsEl = document.createElement('div');
      tabsEl.className = 'group-tabs';
      tabsEl.id = `tabs-${groupId}`;
      group.tabs.forEach(tab => tabsEl.appendChild(createTabRow(tab)));
      groupEl.appendChild(tabsEl);

      container.appendChild(groupEl);
    } else {
      // Ungrouped tabs
      group.tabs.forEach(tab => container.appendChild(createTabRow(tab)));
    }
  });

  // Nested seshs (if any)
  if (session.nested && session.nested.length > 0) {
    for (const nested of session.nested) {
      container.appendChild(Object.assign(document.createElement('div'), { className: 'divider' }));
      const row = document.createElement('a');
      row.className = 'nested-row';
      row.href = nested.url || '#';
      row.target = '_blank';
      row.innerHTML = `${externalLinkSVG}<span class="label">${esc(nested.name || 'Nested Session')}</span><span class="badge">sesh</span><span class="count">${nested.tabCount || '?'}</span>`;
      container.appendChild(row);
    }
  }

  // Expand all button
  const expandBtn = document.getElementById('expand-all');
  window._toggleExpandAll = () => {
    const anyOpen = Object.values(groupStates).some(v => v);
    const newState = !anyOpen;
    for (const k of Object.keys(groupStates)) {
      groupStates[k] = newState;
      renderGroupState(k, newState);
    }
    updateExpandAll(groupStates);
  };
  updateExpandAll(groupStates);

  // Open all button
  document.getElementById('open-all').onclick = () => openAllTabs(session);

  // Store for extension bridge
  window.__seshData = session;
}

function createTabRow(tab) {
  // Detect nested sesh links
  if (tab.url && tab.url.includes('get-sesh.github.io')) {
    const a = document.createElement('a');
    a.className = 'nested-row';
    a.href = tab.url;
    a.target = '_blank';
    const title = tab.title || 'Shared Session';
    a.innerHTML = `${externalLinkSVG}<span class="label">${esc(title)}</span><span class="badge">sesh</span>`;
    return a;
  }

  const a = document.createElement('a');
  a.className = 'tab-row';
  a.href = tab.url;
  a.target = '_blank';

  let domain = '';
  try { domain = new URL(tab.url).hostname.replace(/^www\./, ''); } catch {}
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
  const title = tab.title || domain || tab.url;

  a.innerHTML = `
    <span class="tab-fav"><img src="${favicon}" alt="" onerror="this.style.display='none'"></span>
    <span class="tab-title">${esc(title)}</span>
    <span class="tab-domain">${esc(domain)}</span>
  `;
  return a;
}

function renderGroupState(groupId, open) {
  const tabs = document.getElementById(`tabs-${groupId}`);
  const chevron = document.querySelector(`[data-group="${groupId}"] .chevron`);
  if (!tabs || !chevron) return;

  if (open) {
    tabs.classList.remove('collapsed');
    chevron.style.transform = 'rotate(0deg)';
  } else {
    tabs.classList.add('collapsed');
    chevron.style.transform = 'rotate(-90deg)';
  }
}

function updateExpandAll(states) {
  const btn = document.getElementById('expand-all');
  if (!btn) return;
  const anyOpen = Object.values(states).some(v => v);
  btn.textContent = anyOpen ? 'Close all' : 'Expand all';
}

// ─── Open All Tabs (with confirmation dialog) ───────────────────────────────
function openAllTabs(session) {
  const allTabs = session.tabs || [];
  const urls = session.urls || [];
  const tabCount = allTabs.length || urls.length;
  const groups = getGroups(session);
  const groupCount = groups.filter(g => g.name).length;

  // Don't check for extension here — we'll try at open time
  const extensionDetected = false;

  // Build confirmation dialog
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';

  let groupText = groupCount > 0 ? ` in ${groupCount} group${groupCount !== 1 ? 's' : ''}` : '';
  let installHtml = '';
  if (!extensionDetected) {
    installHtml = `
      <div class="confirm-install">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;color:var(--text-faint)"><path d="M15.6 2.7a10 10 0 1 0 5.7 5.7"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
        <div>
          <div class="confirm-install-title">Install Sesh to preserve tab groups</div>
          <div class="confirm-install-sub">Without the extension, tabs open individually without groups.</div>
        </div>
      </div>
    `;
  }

  overlay.innerHTML = `
    <div class="confirm-dialog">
      <div class="confirm-title">Open ${tabCount} tabs?</div>
      <div class="confirm-sub">This will open ${tabCount} tabs${groupText} from "${esc(session.name)}".</div>
      ${installHtml}
      <div class="confirm-buttons">
        <button class="confirm-cancel">Cancel</button>
        <button class="confirm-open">Open all tabs</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  overlay.querySelector('.confirm-cancel').onclick = () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 200);
  };

  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
    }
  };

  overlay.querySelector('.confirm-open').onclick = () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 200);
    doOpenTabs(session);
  };
}

function doOpenTabs(session) {
  const payload = {
    action: 'openSession',
    name: session.name,
    tabs: session.tabs || [],
    urls: session.urls || []
  };

  // Try extension bridge — wrapped defensively so errors never break the page
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage(EXTENSION_ID, payload, function(response) {
        // Check for errors silently
        var err = chrome.runtime && chrome.runtime.lastError;
        if (err || !response || !response.success) {
          fallbackOpen(session);
        } else {
          showToast('Opened "' + session.name + '" with tab groups');
        }
      });
      return;
    }
  } catch (e) {
    // Extension not available — fall through
  }

  fallbackOpen(session);
}

function fallbackOpen(session) {
  const tabs = session.tabs || [];
  const urls = session.urls || [];
  const allUrls = tabs.length > 0 ? tabs.map(t => t.url) : urls;

  // On mobile, opening multiple tabs gets blocked by popup blockers
  const isMobile = /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent);

  if (isMobile) {
    // Open just the first tab, show a message about the rest
    if (allUrls.length > 0) {
      window.open(allUrls[0], '_blank');
    }
    if (allUrls.length > 1) {
      showToast(`Opened 1 tab. Tap the other ${allUrls.length - 1} links individually on mobile.`);
    }
  } else {
    allUrls.forEach(url => window.open(url, '_blank'));
    showToast('Tabs opened!');
  }
}

// ─── Error state ─────────────────────────────────────────────────────────────
function showError(msg) {
  document.getElementById('content-area').innerHTML = `
    <div class="error-state">
      <h2>Invalid shared link</h2>
      <p>${esc(msg)}</p>
    </div>
  `;
}

// ─── Init ────────────────────────────────────────────────────────────────────
function initSesh() {
  initTheme();

  const session = parseSession();
  if (!session) {
    showError('No session data found in this link. The link may be incomplete or corrupted.');
    return;
  }

  render(session);
}

// Support both direct load and dynamic load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSesh);
} else {
  // DOM already ready (loaded dynamically)
  initSesh();
}
