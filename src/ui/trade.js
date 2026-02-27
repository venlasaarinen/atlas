/**
 * TradeWindow — HTML overlay for bartering between the player and an NPC.
 *
 * Both sides select items to put on the table. The CONFIRM TRADE button
 * activates only when the total value on each side is equal and non-zero.
 * On confirmation the items are transferred between the live inventory objects.
 */
export class TradeWindow {
  constructor() {
    this._el          = null;
    this._character   = null;
    this._playerInv   = null;
    // Staged state — copies of availability and current offer selections.
    // Nothing touches the real inventories until the trade is confirmed.
    this._playerAvail = new Map(); // itemId → { def, qty }
    this._charAvail   = new Map(); // itemId → { def, qty }
    this._playerOffer = new Map(); // itemId → { def, qty }
    this._charOffer   = new Map(); // itemId → { def, qty }
  }

  /**
   * @param {import('../engine/character.js').Character} character
   * @param {import('../engine/inventory.js').Inventory}  playerInventory
   */
  open(character, playerInventory) {
    if (this._el) this._el.remove();
    this._character = character;
    this._playerInv = playerInventory;
    this._playerOffer = new Map();
    this._charOffer   = new Map();

    // Snapshot player inventory grouped by item id
    this._playerAvail = new Map();
    for (const item of playerInventory.items) {
      const e = this._playerAvail.get(item.id);
      if (e) { e.qty++; } else { this._playerAvail.set(item.id, { def: item, qty: 1 }); }
    }

    // Snapshot character inventory
    this._charAvail = new Map();
    for (const { def, quantity } of character.inventoryItems) {
      this._charAvail.set(def.id, { def, qty: quantity });
    }

    this._buildUI();
  }

  close() {
    if (!this._el) return;
    const el = this._el;
    el.style.opacity = '0';
    setTimeout(() => { el.remove(); }, 250);
    this._el = null;
  }

  // ── Build ────────────────────────────────────────────────────────────────────

  _buildUI() {
    if (!document.getElementById('trade-styles')) {
      const s = document.createElement('style');
      s.id = 'trade-styles';
      s.textContent = `
        #trade-overlay * { box-sizing: border-box; }

        .trade-col-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(196,165,90,0.22) transparent;
        }
        .trade-col-scroll::-webkit-scrollbar       { width: 4px; }
        .trade-col-scroll::-webkit-scrollbar-track  { background: transparent; }
        .trade-col-scroll::-webkit-scrollbar-thumb  {
          background: rgba(196,165,90,0.22); border-radius: 2px;
        }

        .trade-item-row {
          display       : flex;
          align-items   : center;
          gap           : 8px;
          padding       : 8px 11px;
          border        : 1px solid rgba(196,165,90,0.10);
          border-radius : 2px;
          margin-bottom : 5px;
          background    : rgba(8,6,4,0.55);
          transition    : border-color 0.14s;
        }
        .trade-item-row:hover { border-color: rgba(196,165,90,0.26); }

        .trade-item-name {
          flex        : 1;
          font-family : Georgia, serif;
          font-size   : 15px;
          color       : #ddd5c4;
          white-space : nowrap;
          overflow    : hidden;
          text-overflow: ellipsis;
        }
        .trade-item-qty {
          font-family    : Cinzel, serif;
          font-size      : 11px;
          color          : #6a5a40;
          letter-spacing : 1px;
          flex-shrink    : 0;
        }
        .trade-item-val {
          font-family    : Cinzel, serif;
          font-size      : 11px;
          color          : #7a6a50;
          letter-spacing : 1px;
          flex-shrink    : 0;
          min-width      : 34px;
          text-align     : right;
        }
        .trade-btn {
          background    : none;
          border        : 1px solid rgba(196,165,90,0.22);
          color         : #c4a55a;
          font-family   : Cinzel, serif;
          font-size     : 10px;
          letter-spacing: 1.5px;
          padding       : 5px 12px;
          cursor        : pointer;
          border-radius : 2px;
          flex-shrink   : 0;
          transition    : background 0.14s, border-color 0.14s;
          white-space   : nowrap;
        }
        .trade-btn:hover {
          background   : rgba(196,165,90,0.12);
          border-color : rgba(196,165,90,0.50);
        }
        .trade-btn.remove {
          border-color : rgba(138,80,60,0.35);
          color        : #8a5040;
        }
        .trade-btn.remove:hover {
          background   : rgba(138,80,60,0.12);
          border-color : rgba(138,80,60,0.60);
        }

        #trade-confirm-btn {
          background    : rgba(196,165,90,0.10);
          border        : 1px solid rgba(196,165,90,0.32);
          color         : #c4a55a;
          font-family   : Cinzel, serif;
          font-size     : 13px;
          letter-spacing: 2.5px;
          padding       : 11px 32px;
          cursor        : pointer;
          border-radius : 2px;
          transition    : background 0.15s, border-color 0.15s;
        }
        #trade-confirm-btn:not(:disabled):hover {
          background   : rgba(196,165,90,0.22);
          border-color : rgba(196,165,90,0.62);
        }
        #trade-confirm-btn:disabled {
          opacity: 0.28;
          cursor : default;
        }

        .trade-empty-note {
          font-family    : Cinzel, serif;
          font-size      : 11px;
          letter-spacing : 1.5px;
          color          : #3a3020;
          padding        : 8px 0;
        }
      `;
      document.head.appendChild(s);
    }

    const charName = this._character.name ?? this._character.id;

    const el = document.createElement('div');
    el.id = 'trade-overlay';
    Object.assign(el.style, {
      position      : 'fixed',
      inset         : '0',
      zIndex        : '200',
      background    : '#0a0804',
      display       : 'flex',
      flexDirection : 'column',
      opacity       : '0',
      transition    : 'opacity 0.22s ease',
      fontFamily    : 'Georgia, serif',
    });

    el.innerHTML = `
      <!-- Header -->
      <div style="
        flex-shrink:0; padding:16px 22px 13px;
        border-bottom:1px solid rgba(196,165,90,0.16);
        display:flex; align-items:center; justify-content:space-between;
      ">
        <div style="font-family:Cinzel,serif;font-size:13px;letter-spacing:3.5px;color:#c4a55a;">
          TRADE — ${this._esc(charName.toUpperCase())}
        </div>
        <button id="trade-close-btn" style="
          background:none; border:1px solid rgba(196,165,90,0.22); color:#7a6a50;
          font-family:Cinzel,serif; font-size:11px; letter-spacing:2px;
          padding:6px 16px; cursor:pointer; border-radius:2px;
          transition:color 0.15s,border-color 0.15s;
        ">✕  CLOSE</button>
      </div>

      <!-- Inventory columns -->
      <div style="flex:1;min-height:0;display:flex;">

        <!-- Player column -->
        <div style="flex:1;display:flex;flex-direction:column;
          border-right:1px solid rgba(196,165,90,0.08);padding:16px 18px;">
          <div style="flex-shrink:0;font-family:Cinzel,serif;font-size:11px;
            letter-spacing:2.5px;color:#6a5a40;margin-bottom:14px;">YOUR ITEMS</div>
          <div id="trade-player-inv" class="trade-col-scroll"
            style="flex:1;min-height:0;overflow-y:auto;"></div>
        </div>

        <!-- Character column -->
        <div style="flex:1;display:flex;flex-direction:column;padding:16px 18px;">
          <div style="flex-shrink:0;font-family:Cinzel,serif;font-size:11px;
            letter-spacing:2.5px;color:#6a5a40;margin-bottom:14px;">
            ${this._esc(charName.toUpperCase())}'S ITEMS</div>
          <div id="trade-char-inv" class="trade-col-scroll"
            style="flex:1;min-height:0;overflow-y:auto;"></div>
        </div>
      </div>

      <!-- Offer area -->
      <div style="
        flex-shrink:0; border-top:1px solid rgba(196,165,90,0.16);
        padding:14px 18px 18px;
      ">
        <!-- Two offer panels -->
        <div style="display:flex;gap:18px;margin-bottom:14px;">

          <!-- Player offer -->
          <div style="flex:1;">
            <div style="font-family:Cinzel,serif;font-size:11px;letter-spacing:2.5px;
              color:#6a5a40;margin-bottom:8px;">YOUR OFFER</div>
            <div id="trade-player-offer" style="min-height:50px;"></div>
            <div style="font-family:Cinzel,serif;font-size:11px;letter-spacing:1.5px;
              color:#6a5a40;margin-top:8px;">
              VALUE <span id="trade-pv" style="color:#c4a55a;margin-left:6px;">0</span>
            </div>
          </div>

          <!-- Arrow -->
          <div style="display:flex;align-items:center;color:rgba(196,165,90,0.22);
            font-size:22px;padding-bottom:18px;">⇌</div>

          <!-- Char offer -->
          <div style="flex:1;">
            <div style="font-family:Cinzel,serif;font-size:11px;letter-spacing:2.5px;
              color:#6a5a40;margin-bottom:8px;">YOU RECEIVE</div>
            <div id="trade-char-offer" style="min-height:50px;"></div>
            <div style="font-family:Cinzel,serif;font-size:11px;letter-spacing:1.5px;
              color:#6a5a40;margin-top:8px;">
              VALUE <span id="trade-cv" style="color:#c4a55a;margin-left:6px;">0</span>
            </div>
          </div>
        </div>

        <!-- Confirm row -->
        <div style="text-align:center;">
          <button id="trade-confirm-btn" disabled>CONFIRM TRADE</button>
          <div id="trade-status" style="
            margin-top:9px; font-family:Cinzel,serif; font-size:11px;
            letter-spacing:1.5px; color:#3a3020;
          ">Select items on both sides — values must match.</div>
        </div>
      </div>
    `;

    document.body.appendChild(el);
    this._el = el;

    requestAnimationFrame(() => { el.style.opacity = '1'; });

    const closeBtn = el.querySelector('#trade-close-btn');
    closeBtn.addEventListener('click',      () => this.close());
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.color       = '#c4a55a';
      closeBtn.style.borderColor = 'rgba(196,165,90,0.55)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.color       = '#7a6a50';
      closeBtn.style.borderColor = 'rgba(196,165,90,0.22)';
    });

    el.querySelector('#trade-confirm-btn')
      .addEventListener('click', () => this._confirmTrade());

    this._renderAll();
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  _renderAll() {
    this._renderInvColumn('#trade-player-inv', this._playerAvail, true);
    this._renderInvColumn('#trade-char-inv',   this._charAvail,   false);
    this._renderOfferColumn('#trade-player-offer', this._playerOffer, true);
    this._renderOfferColumn('#trade-char-offer',   this._charOffer,   false);
    this._updateValueDisplay();
  }

  _renderInvColumn(selector, availMap, isPlayer) {
    const el = this._el?.querySelector(selector);
    if (!el) return;
    el.innerHTML = '';

    const visible = [...availMap.values()].filter(e => e.qty > 0);
    if (visible.length === 0) {
      el.innerHTML = `<div class="trade-empty-note">${isPlayer ? 'Nothing to offer.' : 'Nothing available.'}</div>`;
      return;
    }

    for (const { def, qty } of visible) {
      const row = document.createElement('div');
      row.className = 'trade-item-row';

      const nameEl = document.createElement('div');
      nameEl.className   = 'trade-item-name';
      nameEl.textContent = def.name ?? def.id;

      const qtyEl = document.createElement('div');
      qtyEl.className   = 'trade-item-qty';
      qtyEl.textContent = `×${qty}`;

      const valEl = document.createElement('div');
      valEl.className   = 'trade-item-val';
      valEl.textContent = def.value != null ? String(def.value) : '—';

      const btn = document.createElement('button');
      btn.className   = 'trade-btn';
      btn.textContent = 'OFFER';
      btn.addEventListener('click', () => this._addToOffer(def, isPlayer));

      row.append(nameEl, qtyEl, valEl, btn);
      el.appendChild(row);
    }
  }

  _renderOfferColumn(selector, offerMap, isPlayer) {
    const el = this._el?.querySelector(selector);
    if (!el) return;
    el.innerHTML = '';

    const active = [...offerMap.values()].filter(e => e.qty > 0);
    if (active.length === 0) {
      el.innerHTML = `<div class="trade-empty-note">Select items above.</div>`;
      return;
    }

    for (const { def, qty } of active) {
      const totalVal = (def.value ?? 0) * qty;
      const row = document.createElement('div');
      row.className = 'trade-item-row';

      const nameEl = document.createElement('div');
      nameEl.className   = 'trade-item-name';
      nameEl.textContent = def.name ?? def.id;

      const qtyEl = document.createElement('div');
      qtyEl.className   = 'trade-item-qty';
      qtyEl.textContent = `×${qty}`;

      const valEl = document.createElement('div');
      valEl.className     = 'trade-item-val';
      valEl.style.color   = '#c4a55a';
      valEl.textContent   = String(totalVal);

      const btn = document.createElement('button');
      btn.className   = 'trade-btn remove';
      btn.textContent = '−';
      btn.addEventListener('click', () => this._removeFromOffer(def, isPlayer));

      row.append(nameEl, qtyEl, valEl, btn);
      el.appendChild(row);
    }
  }

  _updateValueDisplay() {
    if (!this._el) return;

    const sum = (offerMap) =>
      [...offerMap.values()].reduce((acc, { def, qty }) => acc + (def.value ?? 0) * qty, 0);

    const pv = sum(this._playerOffer);
    const cv = sum(this._charOffer);

    this._el.querySelector('#trade-pv').textContent = pv;
    this._el.querySelector('#trade-cv').textContent = cv;

    const confirmBtn = this._el.querySelector('#trade-confirm-btn');
    const statusEl   = this._el.querySelector('#trade-status');

    const canTrade = pv > 0 && cv > 0 && pv === cv;
    confirmBtn.disabled = !canTrade;

    if (pv === 0 && cv === 0) {
      statusEl.textContent  = 'Select items on both sides — values must match.';
      statusEl.style.color  = '#3a3020';
    } else if (pv === cv && pv > 0) {
      statusEl.textContent  = 'Values match. Ready to trade.';
      statusEl.style.color  = '#8a9a70';
    } else {
      const diff = Math.abs(pv - cv);
      statusEl.textContent  = pv > cv
        ? `Your offer is worth ${diff} more.`
        : `Their offer is worth ${diff} more.`;
      statusEl.style.color  = '#3a3020';
    }
  }

  // ── Staging ──────────────────────────────────────────────────────────────────

  _addToOffer(def, isPlayer) {
    const avail = isPlayer ? this._playerAvail : this._charAvail;
    const offer = isPlayer ? this._playerOffer : this._charOffer;

    const availEntry = avail.get(def.id);
    if (!availEntry || availEntry.qty <= 0) return;

    availEntry.qty--;
    if (availEntry.qty === 0) avail.delete(def.id);

    const offerEntry = offer.get(def.id);
    if (offerEntry) { offerEntry.qty++; } else { offer.set(def.id, { def, qty: 1 }); }

    this._renderAll();
  }

  _removeFromOffer(def, isPlayer) {
    const avail = isPlayer ? this._playerAvail : this._charAvail;
    const offer = isPlayer ? this._playerOffer : this._charOffer;

    const offerEntry = offer.get(def.id);
    if (!offerEntry || offerEntry.qty <= 0) return;

    offerEntry.qty--;
    if (offerEntry.qty === 0) offer.delete(def.id);

    const availEntry = avail.get(def.id);
    if (availEntry) { availEntry.qty++; } else { avail.set(def.id, { def, qty: 1 }); }

    this._renderAll();
  }

  // ── Confirm ──────────────────────────────────────────────────────────────────

  _confirmTrade() {
    // Remove player's offered items from their inventory
    for (const [id, { qty }] of this._playerOffer) {
      for (let i = 0; i < qty; i++) this._playerInv.remove(id);
    }
    // Add character's offered items to player inventory
    for (const [, { def, qty }] of this._charOffer) {
      for (let i = 0; i < qty; i++) this._playerInv.add(def);
    }
    // Remove character's offered items from character inventory
    for (const [id, { qty }] of this._charOffer) {
      this._character.removeItem(id, qty);
    }
    // Add player's offered items to character inventory
    for (const [, { def, qty }] of this._playerOffer) {
      this._character.addItem(def, qty);
    }

    // Flash success then close
    const statusEl = this._el?.querySelector('#trade-status');
    if (statusEl) {
      statusEl.textContent = 'Trade complete.';
      statusEl.style.color = '#c4a55a';
    }
    const confirmBtn = this._el?.querySelector('#trade-confirm-btn');
    if (confirmBtn) confirmBtn.disabled = true;

    setTimeout(() => this.close(), 700);
  }

  // ── Util ─────────────────────────────────────────────────────────────────────

  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
