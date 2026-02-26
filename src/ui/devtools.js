/**
 * Developer coordinate tool.
 *
 * Press P to toggle.  While active:
 *  – A small HUD in the top-left shows live x% / y% under the cursor.
 *  – A floating label follows the cursor.
 *  – Click anywhere to copy  `[x, y]`  to the clipboard (YAML-ready).
 */

const TOGGLE_KEY = 'p';

export function initDevTools() {
  let active = false;

  // ── DOM ──────────────────────────────────────────────────────────────────

  const style = document.createElement('style');
  style.textContent = `
    #dev-hud {
      position: fixed;
      top: 12px;
      left: 12px;
      z-index: 9999;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      color: #c4a55a;
      background: rgba(0,0,0,0.7);
      border: 1px solid rgba(196,165,90,0.35);
      padding: 5px 10px;
      pointer-events: none;
      letter-spacing: 0.08em;
      display: none;
    }
    #dev-hud .dev-hint {
      color: #4a4030;
      font-size: 9px;
      margin-top: 2px;
      letter-spacing: 0.05em;
    }
    #dev-cursor {
      position: fixed;
      z-index: 9999;
      font-family: 'Courier New', monospace;
      font-size: 10px;
      color: #c4a55a;
      background: rgba(0,0,0,0.55);
      padding: 2px 6px;
      pointer-events: none;
      white-space: nowrap;
      display: none;
      transform: translate(14px, -50%);
    }
    #dev-copy-flash {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 10000;
      font-family: 'Cinzel', serif;
      font-size: 12px;
      letter-spacing: 0.2em;
      color: #c4a55a;
      background: rgba(0,0,0,0.8);
      border: 1px solid rgba(196,165,90,0.4);
      padding: 10px 22px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s ease;
    }
    #dev-copy-flash.show {
      opacity: 1;
    }
  `;
  document.head.appendChild(style);

  const hud = document.createElement('div');
  hud.id = 'dev-hud';
  hud.innerHTML = `
    <span id="dev-coords">x: —  y: —</span>
    <div class="dev-hint">P to toggle · click to copy</div>
  `;
  document.body.appendChild(hud);

  const cursor = document.createElement('div');
  cursor.id = 'dev-cursor';
  document.body.appendChild(cursor);

  const flash = document.createElement('div');
  flash.id = 'dev-copy-flash';
  flash.textContent = 'COPIED';
  document.body.appendChild(flash);

  const coordsEl = document.getElementById('dev-coords');

  // ── State ─────────────────────────────────────────────────────────────────

  let cx = 0, cy = 0;
  let flashTimer = null;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function toPercent(px, total) {
    return Math.round((px / total) * 1000) / 10; // 1 decimal place
  }

  function update(e) {
    cx = toPercent(e.clientX, window.innerWidth);
    cy = toPercent(e.clientY, window.innerHeight);

    const label = `${cx}, ${cy}`;
    coordsEl.textContent = `x: ${cx}%   y: ${cy}%`;
    cursor.textContent   = label;
    cursor.style.left    = e.clientX + 'px';
    cursor.style.top     = e.clientY + 'px';
  }

  function copyCoords() {
    if (!active) return;
    const text = `[${cx}, ${cy}]`;
    navigator.clipboard.writeText(text).then(() => {
      flash.classList.add('show');
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(() => flash.classList.remove('show'), 900);
    }).catch(() => {
      // Fallback for non-secure contexts
      console.log(`[devtools] coordinates: ${text}`);
    });
  }

  function setActive(on) {
    active = on;
    hud.style.display    = on ? 'block' : 'none';
    cursor.style.display = on ? 'block' : 'none';
    document.body.style.cursor = on ? 'crosshair' : '';
  }

  // ── Events ────────────────────────────────────────────────────────────────

  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === TOGGLE_KEY && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setActive(!active);
    }
  });

  window.addEventListener('mousemove', e => {
    if (active) update(e);
  });

  window.addEventListener('click', e => {
    if (active) copyCoords();
  });
}
