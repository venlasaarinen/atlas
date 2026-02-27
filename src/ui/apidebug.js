/**
 * API Debug Overlay — toggled with Ctrl+O.
 *
 * Shows a full-screen panel listing every OpenAI API call the engine has made,
 * with pretty-printed JSON request/response detail on the right.
 */

import { apiLog } from '../engine/apilogger.js';

let overlay = null;
let listBody = null;
let detailPane = null;
let countEl = null;
let selectedId = null;

// ── Syntax-highlighted JSON ────────────────────────────────────────────────

function highlightJSON(obj) {
  const raw = JSON.stringify(obj, null, 2);
  if (!raw) return '<span style="color:#666">null</span>';
  // Syntax-highlight first (on single-line JSON strings)
  const highlighted = raw.replace(
    /("(?:\\.|[^"\\])*")\s*:/g,
    '<span style="color:#c4a55a">$1</span>:'
  ).replace(
    /:\s*("(?:\\.|[^"\\])*")/g,
    ': <span style="color:#e0d6c2">$1</span>'
  ).replace(
    /:\s*(\d+\.?\d*)/g,
    ': <span style="color:#7aafcf">$1</span>'
  ).replace(
    /:\s*(true|false|null)/g,
    ': <span style="color:#a58fd0">$1</span>'
  );
  // Then convert literal \n inside strings to real newlines for readability
  return highlighted.replace(/\\n/g, '\n');
}

// ── Build DOM ──────────────────────────────────────────────────────────────

function buildOverlay() {
  const el = document.createElement('div');
  el.id = 'api-debug-overlay';
  el.innerHTML = `
    <div class="apid-header">
      <span class="apid-title">API Debug Log</span>
      <span class="apid-count" id="apid-count">0 entries</span>
      <div class="apid-actions">
        <button class="apid-btn" id="apid-clear">Clear</button>
        <button class="apid-btn" id="apid-close">&times;</button>
      </div>
    </div>
    <div class="apid-body">
      <div class="apid-list">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th>Type</th>
              <th>Status</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody id="apid-list-body"></tbody>
        </table>
      </div>
      <div class="apid-detail" id="apid-detail">
        <div class="apid-placeholder">Select a request to view details</div>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  // Inject styles once
  const style = document.createElement('style');
  style.textContent = STYLES;
  document.head.appendChild(style);

  overlay    = el;
  listBody   = el.querySelector('#apid-list-body');
  detailPane = el.querySelector('#apid-detail');
  countEl    = el.querySelector('#apid-count');

  el.querySelector('#apid-close').addEventListener('click', hide);
  el.querySelector('#apid-clear').addEventListener('click', () => {
    apiLog.clear();
    listBody.innerHTML = '';
    detailPane.innerHTML = '<div class="apid-placeholder">Select a request to view details</div>';
    countEl.textContent = '0 entries';
    selectedId = null;
  });
}

// ── Show / Hide ────────────────────────────────────────────────────────────

function show() {
  if (!overlay) buildOverlay();
  rebuildList();
  overlay.style.display = 'flex';
}

function hide() {
  if (overlay) overlay.style.display = 'none';
}

function toggle() {
  if (!overlay || overlay.style.display === 'none') show();
  else hide();
}

// ── List management ────────────────────────────────────────────────────────

function rebuildList() {
  listBody.innerHTML = '';
  selectedId = null;
  for (const entry of apiLog.entries) {
    appendRow(entry);
  }
  countEl.textContent = `${apiLog.entries.length} entr${apiLog.entries.length === 1 ? 'y' : 'ies'}`;
}

function appendRow(entry) {
  const tr = document.createElement('tr');
  tr.dataset.id = entry.id;
  const statusClass = entry.status >= 200 && entry.status < 300 ? 'apid-ok' : 'apid-err';
  tr.innerHTML = `
    <td>${entry.id}</td>
    <td>${entry.timestamp}</td>
    <td><span class="apid-label-${entry.label}">${entry.label}</span></td>
    <td><span class="${statusClass}">${entry.status}</span></td>
    <td>${entry.durationMs}ms</td>
  `;
  tr.addEventListener('click', () => selectEntry(entry, tr));
  listBody.appendChild(tr);

  // Auto-scroll the list
  const listEl = listBody.closest('.apid-list');
  listEl.scrollTop = listEl.scrollHeight;
}

function selectEntry(entry, tr) {
  // Deselect previous
  const prev = listBody.querySelector('tr.selected');
  if (prev) prev.classList.remove('selected');

  tr.classList.add('selected');
  selectedId = entry.id;

  detailPane.innerHTML = `
    <details class="apid-section" open>
      <summary>Request</summary>
      <div class="apid-sub">Headers</div>
      <pre>${highlightJSON(entry.requestHeaders)}</pre>
      <div class="apid-sub">Body</div>
      <pre>${highlightJSON(entry.requestBody)}</pre>
    </details>
    <details class="apid-section" open>
      <summary>Response <span class="${entry.status >= 200 && entry.status < 300 ? 'apid-ok' : 'apid-err'}">${entry.status}</span></summary>
      <pre>${highlightJSON(entry.responseBody)}</pre>
    </details>
  `;
}

// ── Live updates ───────────────────────────────────────────────────────────

function onLogChange(entry) {
  if (!overlay || overlay.style.display === 'none') return;
  if (!entry) {
    // clear was called
    rebuildList();
    return;
  }
  appendRow(entry);
  countEl.textContent = `${apiLog.entries.length} entr${apiLog.entries.length === 1 ? 'y' : 'ies'}`;
}

// ── Init ───────────────────────────────────────────────────────────────────

export function initApiDebug() {
  apiLog.onChange = onLogChange;

  window.addEventListener('keydown', (e) => {
    if (e.key === 'o' && e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      toggle();
    }
    if (e.key === 'Escape' && overlay && overlay.style.display !== 'none') {
      hide();
    }
  });
}

// ── Styles ─────────────────────────────────────────────────────────────────

const STYLES = `
  #api-debug-overlay {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 10001;
    flex-direction: column;
    background: rgba(13, 13, 15, 0.95);
    color: #e0d6c2;
    font-family: 'Crimson Text', Georgia, serif;
    font-size: 14px;
  }

  /* Header */
  .apid-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 20px;
    border-bottom: 1px solid rgba(196, 165, 90, 0.25);
    flex-shrink: 0;
  }
  .apid-title {
    font-family: 'Cinzel', serif;
    font-size: 16px;
    color: #c4a55a;
    letter-spacing: 0.12em;
  }
  .apid-count {
    font-size: 12px;
    color: #6a5f4b;
    letter-spacing: 0.05em;
  }
  .apid-actions {
    margin-left: auto;
    display: flex;
    gap: 8px;
  }
  .apid-btn {
    background: rgba(196, 165, 90, 0.1);
    border: 1px solid rgba(196, 165, 90, 0.3);
    color: #c4a55a;
    font-family: 'Cinzel', serif;
    font-size: 12px;
    padding: 4px 14px;
    cursor: pointer;
    letter-spacing: 0.08em;
    transition: background 0.15s;
  }
  .apid-btn:hover {
    background: rgba(196, 165, 90, 0.2);
  }

  /* Body layout */
  .apid-body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  /* Left panel — request list */
  .apid-list {
    width: 35%;
    overflow-y: auto;
    border-right: 1px solid rgba(196, 165, 90, 0.15);
  }
  .apid-list table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    font-family: 'Courier New', monospace;
  }
  .apid-list thead th {
    position: sticky;
    top: 0;
    background: rgba(13, 13, 15, 0.98);
    padding: 6px 10px;
    text-align: left;
    color: #6a5f4b;
    font-weight: normal;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-size: 10px;
    border-bottom: 1px solid rgba(196, 165, 90, 0.15);
  }
  .apid-list tbody tr {
    cursor: pointer;
    transition: background 0.1s;
  }
  .apid-list tbody tr:hover {
    background: rgba(196, 165, 90, 0.08);
  }
  .apid-list tbody tr.selected {
    background: rgba(196, 165, 90, 0.12);
    box-shadow: inset 3px 0 0 #c4a55a;
  }
  .apid-list td {
    padding: 5px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    white-space: nowrap;
  }

  /* Type labels */
  .apid-label-chat    { color: #7aafcf; }
  .apid-label-choices { color: #a58fd0; }
  .apid-label-summary { color: #8fbf7a; }

  /* Status badges */
  .apid-ok  { color: #8fbf7a; }
  .apid-err { color: #cf7a7a; }

  /* Right panel — detail view */
  .apid-detail {
    width: 65%;
    overflow-y: auto;
    padding: 16px 20px;
  }
  .apid-placeholder {
    color: #4a4030;
    font-style: italic;
    text-align: center;
    margin-top: 40px;
    letter-spacing: 0.08em;
  }
  .apid-section {
    margin-bottom: 20px;
  }
  .apid-section summary {
    font-family: 'Cinzel', serif;
    font-size: 13px;
    color: #c4a55a;
    letter-spacing: 0.1em;
    cursor: pointer;
    padding: 6px 0;
    border-bottom: 1px solid rgba(196, 165, 90, 0.15);
    user-select: none;
  }
  .apid-sub {
    font-size: 11px;
    color: #6a5f4b;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin: 12px 0 4px;
  }
  .apid-detail pre {
    font-family: 'Courier New', monospace;
    font-size: 11px;
    line-height: 1.5;
    color: #e0d6c2;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(196, 165, 90, 0.1);
    padding: 10px 14px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
  }

  /* Scrollbar styling */
  .apid-list::-webkit-scrollbar,
  .apid-detail::-webkit-scrollbar {
    width: 6px;
  }
  .apid-list::-webkit-scrollbar-thumb,
  .apid-detail::-webkit-scrollbar-thumb {
    background: rgba(196, 165, 90, 0.2);
    border-radius: 3px;
  }
`;
