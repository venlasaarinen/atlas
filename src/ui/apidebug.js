/**
 * API Debug Overlay — toggled with Ctrl+O.
 *
 * Shows a full-screen panel listing every OpenAI API call the engine has made,
 * with pretty-printed JSON request/response detail on the right.
 *
 * Clicking "Edit & Re-submit" on a selected request opens a full-screen editor
 * where you can modify the JSON body and send it again.
 */

import { apiLog } from '../engine/apilogger.js';

let overlay = null;
let listBody = null;
let detailPane = null;
let countEl = null;
let selectedId = null;
let editorEl = null;

const _apiKey = import.meta.env.VITE_OPENAI_API_KEY ?? '';

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

function escapeHTML(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    <!-- Full-screen editor (hidden by default) -->
    <div class="apid-editor" id="apid-editor"></div>
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
  editorEl   = el.querySelector('#apid-editor');

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
  closeEditor();
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
      <div class="apid-edit-bar">
        <button class="apid-btn apid-edit-btn" id="apid-open-editor">Edit &amp; Re-submit</button>
      </div>
    </details>
    <details class="apid-section" open>
      <summary>Response <span class="${entry.status >= 200 && entry.status < 300 ? 'apid-ok' : 'apid-err'}">${entry.status}</span></summary>
      <pre>${highlightJSON(entry.responseBody)}</pre>
    </details>
  `;

  detailPane.querySelector('#apid-open-editor').addEventListener('click', () => openEditor(entry));
}

// ── Full-screen editor ────────────────────────────────────────────────────

function openEditor(entry) {
  const bodyJson = JSON.stringify(entry.requestBody, null, 2) ?? '';

  editorEl.innerHTML = `
    <div class="apid-editor-header">
      <span class="apid-title">Edit Request Body</span>
      <span class="apid-editor-hint">Ctrl+Enter to re-submit</span>
      <div class="apid-actions">
        <button class="apid-btn apid-resend-btn" id="apid-editor-send">Re-submit</button>
        <button class="apid-btn" id="apid-editor-close">Back</button>
      </div>
    </div>
    <div class="apid-editor-status-bar">
      <span class="apid-editor-status" id="apid-editor-status"></span>
    </div>
    <div class="apid-editor-panels">
      <div class="apid-editor-left">
        <div class="apid-editor-label">Request Body</div>
        <textarea class="apid-editor-textarea" id="apid-editor-body" spellcheck="false">${escapeHTML(bodyJson)}</textarea>
      </div>
      <div class="apid-editor-right">
        <div class="apid-editor-label">Response</div>
        <pre class="apid-editor-response" id="apid-editor-response"><span style="color:#4a4030;font-style:italic">Response will appear here after re-submit</span></pre>
      </div>
    </div>
  `;

  editorEl.style.display = 'flex';

  const textarea = editorEl.querySelector('#apid-editor-body');
  const sendBtn = editorEl.querySelector('#apid-editor-send');
  const closeBtn = editorEl.querySelector('#apid-editor-close');

  const doSend = () => editorSend(entry);

  sendBtn.addEventListener('click', doSend);
  closeBtn.addEventListener('click', closeEditor);

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      doSend();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeEditor();
    }
    // Tab inserts spaces instead of moving focus
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
    }
  });

  textarea.focus();
}

function closeEditor() {
  if (editorEl) {
    editorEl.style.display = 'none';
    editorEl.innerHTML = '';
  }
}

async function editorSend(entry) {
  const textarea = editorEl.querySelector('#apid-editor-body');
  const statusEl = editorEl.querySelector('#apid-editor-status');
  const responseEl = editorEl.querySelector('#apid-editor-response');
  const sendBtn = editorEl.querySelector('#apid-editor-send');

  let parsedBody;
  try {
    parsedBody = JSON.parse(textarea.value);
  } catch (err) {
    statusEl.textContent = `Invalid JSON: ${err.message}`;
    statusEl.className = 'apid-editor-status apid-err';
    return;
  }

  // Disable button while in-flight
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending\u2026';
  statusEl.textContent = 'Sending request\u2026';
  statusEl.className = 'apid-editor-status';
  responseEl.innerHTML = '<span style="color:#6a5f4b;font-style:italic">Waiting for response\u2026</span>';

  // Build headers, replacing the redacted auth with the real key
  const headers = { ...entry.requestHeaders };
  if (_apiKey) {
    const authKey = headers['Authorization'] !== undefined ? 'Authorization' : 'authorization';
    if (headers[authKey] === 'Bearer ***') {
      headers[authKey] = `Bearer ${_apiKey}`;
    }
  }

  const start = performance.now();
  let status = 0;
  let responseBody = null;

  try {
    const response = await fetch(entry.url, {
      method: entry.method,
      headers,
      body: JSON.stringify(parsedBody),
    });
    status = response.status;
    responseBody = await response.json();
  } catch (err) {
    responseBody = { error: err.message };
  }

  const durationMs = Math.round(performance.now() - start);

  // Log the replayed request as a new entry
  apiLog.record({
    label: entry.label + ' \u21BB',
    method: entry.method,
    url: entry.url,
    requestHeaders: headers,
    requestBody: parsedBody,
    status,
    responseBody,
    durationMs,
  });

  // Re-enable button
  sendBtn.disabled = false;
  sendBtn.textContent = 'Re-submit';

  const newId = apiLog.entries[apiLog.entries.length - 1].id;
  if (status >= 200 && status < 300) {
    statusEl.textContent = `\u2713 ${status} \u2014 ${durationMs}ms (logged #${newId})`;
    statusEl.className = 'apid-editor-status apid-ok';
  } else if (status > 0) {
    statusEl.textContent = `\u2717 ${status} \u2014 ${durationMs}ms (logged #${newId})`;
    statusEl.className = 'apid-editor-status apid-err';
  } else {
    statusEl.textContent = `Error \u2014 ${responseBody?.error ?? 'unknown'}`;
    statusEl.className = 'apid-editor-status apid-err';
  }

  // Show response
  responseEl.innerHTML = highlightJSON(responseBody);
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
      // If editor is open, close editor first; otherwise close the whole overlay
      if (editorEl && editorEl.style.display !== 'none') {
        closeEditor();
      } else {
        hide();
      }
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

  /* Edit & Re-submit button in the detail view */
  .apid-edit-bar {
    margin: 10px 0 4px;
  }
  .apid-edit-btn {
    background: rgba(122, 175, 207, 0.12) !important;
    border-color: rgba(122, 175, 207, 0.35) !important;
    color: #7aafcf !important;
  }
  .apid-edit-btn:hover {
    background: rgba(122, 175, 207, 0.22) !important;
  }

  /* ── Full-screen editor overlay ─────────────────────────────────────────── */
  .apid-editor {
    display: none;
    position: absolute;
    inset: 0;
    z-index: 1;
    flex-direction: column;
    background: rgba(13, 13, 15, 0.98);
  }

  .apid-editor-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 20px;
    border-bottom: 1px solid rgba(196, 165, 90, 0.25);
    flex-shrink: 0;
  }
  .apid-editor-hint {
    font-size: 11px;
    color: #6a5f4b;
    font-style: italic;
    letter-spacing: 0.03em;
  }

  .apid-editor-status-bar {
    padding: 4px 20px;
    min-height: 22px;
    flex-shrink: 0;
  }
  .apid-editor-status {
    font-size: 11px;
    font-family: 'Courier New', monospace;
    color: #6a5f4b;
  }

  .apid-editor-panels {
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 0;
  }
  .apid-editor-left,
  .apid-editor-right {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .apid-editor-left {
    border-right: 1px solid rgba(196, 165, 90, 0.15);
  }
  .apid-editor-label {
    font-family: 'Cinzel', serif;
    font-size: 11px;
    color: #6a5f4b;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 8px 16px 4px;
    flex-shrink: 0;
  }

  .apid-editor-textarea {
    flex: 1;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    line-height: 1.5;
    color: #e0d6c2;
    background: rgba(0, 0, 0, 0.3);
    border: none;
    border-top: 1px solid rgba(196, 165, 90, 0.1);
    padding: 12px 16px;
    resize: none;
    white-space: pre;
    tab-size: 2;
    overflow: auto;
    margin: 0;
  }
  .apid-editor-textarea:focus {
    outline: none;
    background: rgba(0, 0, 0, 0.4);
  }

  .apid-editor-response {
    flex: 1;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    line-height: 1.5;
    color: #e0d6c2;
    background: rgba(0, 0, 0, 0.3);
    border: none;
    border-top: 1px solid rgba(196, 165, 90, 0.1);
    padding: 12px 16px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
  }

  .apid-resend-btn {
    background: rgba(122, 175, 207, 0.12) !important;
    border-color: rgba(122, 175, 207, 0.35) !important;
    color: #7aafcf !important;
  }
  .apid-resend-btn:hover {
    background: rgba(122, 175, 207, 0.22) !important;
  }
  .apid-resend-btn:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  /* Scrollbar styling */
  .apid-list::-webkit-scrollbar,
  .apid-detail::-webkit-scrollbar,
  .apid-editor-textarea::-webkit-scrollbar,
  .apid-editor-response::-webkit-scrollbar {
    width: 6px;
  }
  .apid-list::-webkit-scrollbar-thumb,
  .apid-detail::-webkit-scrollbar-thumb,
  .apid-editor-textarea::-webkit-scrollbar-thumb,
  .apid-editor-response::-webkit-scrollbar-thumb {
    background: rgba(196, 165, 90, 0.2);
    border-radius: 3px;
  }
`;
