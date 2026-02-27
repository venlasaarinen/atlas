import { TradeWindow } from './trade.js';

/**
 * ChatWindow — visual-novel-style HTML overlay for AI character dialogue.
 *
 * Layout:
 *   - Character portrait fills the background
 *   - Full-height flex layout: history stretches from name header to the top
 *     of the choices, filling the entire screen height from the start
 *   - Loading state keeps all 4 choice-box outlines at fixed size (no shrink)
 *   - Georgia used for all body / dialogue text (more readable than Crimson Text)
 */
export class ChatWindow {
  constructor() {
    this.visible        = false;
    this._session       = null;
    this._character     = null;
    this._el            = null;
    this._historyEl     = null;
    this._choicesEl     = null;
    this._lastChoices   = null;
    this._playerInv     = null;   // set via setRefs()
    this._itemDefs      = null;   // set via setRefs()
    this._tradeWindow   = new TradeWindow();
  }

  /**
   * Provide live references to the player inventory and item definitions.
   * Called by WorldManager after it loads the world.
   *
   * @param {import('../engine/inventory.js').Inventory} playerInventory
   * @param {Map<string,object>} itemDefs
   */
  setRefs(playerInventory, itemDefs) {
    this._playerInv = playerInventory;
    this._itemDefs  = itemDefs;
  }

  open(character, session) {
    this._character = character;
    this._session   = session;
    this.visible    = true;
    // Resolve the character's YAML inventory to full item defs (persists on charData)
    if (this._itemDefs) character._initInventory(this._itemDefs);
    this._buildUI();
    this._showGreeting();
  }

  close() {
    this._tradeWindow.close();
    if (!this._el) return;
    const el = this._el;
    el.style.opacity   = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 300);

    this._el          = null;
    this._historyEl   = null;
    this._choicesEl   = null;
    this._session     = null;
    this._character   = null;
    this._lastChoices = null;
    this.visible      = false;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  _buildUI() {
    this._el?.remove();

    const char       = this._character;
    const portraitUrl = (char._assetPath && char.portrait)
      ? char._assetPath + char.portrait
      : null;

    if (!document.getElementById('chat-styles')) {
      const style = document.createElement('style');
      style.id = 'chat-styles';
      style.textContent = `
        #chat-overlay * { box-sizing: border-box; }

        @keyframes chat-pulse {
          0%, 100% { opacity: 0.20; }
          50%       { opacity: 0.75; }
        }

        /* ── Scrollbars ── */
        #chat-history {
          scrollbar-width: thin;
          scrollbar-color: rgba(196,165,90,0.22) transparent;
        }
        #chat-history::-webkit-scrollbar       { width: 4px; }
        #chat-history::-webkit-scrollbar-track  { background: transparent; }
        #chat-history::-webkit-scrollbar-thumb  {
          background: rgba(196,165,90,0.22); border-radius: 2px;
        }
        #chat-history::-webkit-scrollbar-thumb:hover {
          background: rgba(196,165,90,0.48);
        }
        #chat-overlay textarea {
          scrollbar-width: thin;
          scrollbar-color: rgba(196,165,90,0.22) transparent;
        }
        #chat-overlay textarea::-webkit-scrollbar       { width: 4px; }
        #chat-overlay textarea::-webkit-scrollbar-track  { background: transparent; }
        #chat-overlay textarea::-webkit-scrollbar-thumb  {
          background: rgba(196,165,90,0.22); border-radius: 2px;
        }

        /* ── Choice buttons ── */
        #chat-overlay .chat-choice-btn {
          background    : rgba(8,6,4,0.80);
          border        : 1px solid rgba(196,165,90,0.22);
          color         : #ddd5c4;
          font-family   : Georgia, serif;
          font-size     : 15px;
          line-height   : 1.45;
          padding       : 11px 16px;
          min-height    : 44px;
          cursor        : pointer;
          text-align    : left;
          border-radius : 2px;
          width         : 100%;
          transition    : background 0.15s, border-color 0.15s, color 0.15s;
        }
        #chat-overlay .chat-choice-btn:hover {
          background  : rgba(196,165,90,0.13);
          border-color: rgba(196,165,90,0.60);
          color       : #ffffff;
        }

        /* ── Free-write button ── */
        #chat-overlay .chat-choice-free {
          background    : rgba(8,6,4,0.70);
          border        : 1px dashed rgba(196,165,90,0.20);
          color         : #5a4a30;
          font-family   : Georgia, serif;
          font-size     : 14px;
          line-height   : 1.45;
          padding       : 11px 16px;
          min-height    : 44px;
          cursor        : pointer;
          text-align    : left;
          border-radius : 2px;
          width         : 100%;
          transition    : background 0.15s, border-color 0.15s, color 0.15s;
        }
        #chat-overlay .chat-choice-free:hover {
          background  : rgba(196,165,90,0.08);
          border-color: rgba(196,165,90,0.40);
          color       : #c4a55a;
        }

        /* ── Loading skeletons — fixed height so layout never shifts ── */
        #chat-overlay .chat-choice-loading {
          background    : rgba(8,6,4,0.72);
          border-radius : 2px;
          min-height    : 44px;
          padding       : 11px 16px;
          display       : flex;
          align-items   : center;
          animation     : chat-pulse 1.7s ease-in-out infinite;
        }

        /* ── Textarea ── */
        #chat-overlay textarea {
          background   : rgba(8,6,4,0.88);
          border       : 1px solid rgba(196,165,90,0.40);
          color        : #ddd5c4;
          font-family  : Georgia, serif;
          font-size    : 15px;
          line-height  : 1.5;
          padding      : 10px 14px;
          border-radius: 2px;
          resize       : none;
          outline      : none;
          width        : 100%;
          height       : 68px;
        }
        #chat-overlay textarea:focus {
          border-color: rgba(196,165,90,0.65);
        }
        #chat-overlay textarea::placeholder {
          color: rgba(196,165,90,0.28); font-style: italic;
        }
      `;
      document.head.appendChild(style);
    }

    // ── Outer overlay — full-screen flex column, no bottom-pinning ──────────
    const el = document.createElement('div');
    el.id = 'chat-overlay';
    Object.assign(el.style, {
      position      : 'fixed',
      inset         : '0',
      zIndex        : '100',
      display       : 'flex',
      flexDirection : 'column',
      alignItems    : 'center',
      // No justify-content: flex-end — content panel grows to fill height
      opacity       : '0',
      transform     : 'translateY(8px)',
      transition    : 'opacity 0.35s ease, transform 0.35s ease',
      background    : portraitUrl
        ? `url('${portraitUrl}') center top / cover no-repeat #0d0d0f`
        : '#0d0d0f',
    });

    el.innerHTML = `
      <!-- Gradient: subtle at top, opaque at bottom -->
      <div style="
        position: absolute; inset: 0; pointer-events: none;
        background: linear-gradient(
          to bottom,
          rgba(5,4,3,0.35)  0%,
          rgba(5,4,3,0.15) 22%,
          rgba(5,4,3,0.55) 50%,
          rgba(5,4,3,0.92) 72%,
          rgba(5,4,3,1.00) 100%
        );
      "></div>

      <!-- Leave button -->
      <button id="chat-close-btn" style="
        position: absolute; top: 18px; right: 20px; z-index: 2;
        background: none;
        border: 1px solid rgba(196,165,90,0.28);
        color: #7a6a50;
        font-family: Cinzel, serif;
        font-size: 10px;
        letter-spacing: 2.5px;
        padding: 6px 14px;
        cursor: pointer;
        border-radius: 2px;
        transition: color 0.2s, border-color 0.2s;
      ">✕  LEAVE</button>

      <!-- Trade button — top-left, shown when character has items -->
      <button id="chat-trade-btn" style="
        position: absolute; top: 18px; left: 20px; z-index: 2;
        background: none;
        border: 1px solid rgba(196,165,90,0.28);
        color: #7a6a50;
        font-family: Cinzel, serif;
        font-size: 10px;
        letter-spacing: 2.5px;
        padding: 6px 14px;
        cursor: pointer;
        border-radius: 2px;
        transition: color 0.2s, border-color 0.2s;
      ">⇌  TRADE</button>

      <!-- Content panel: flex column, grows to fill the overlay height -->
      <div id="chat-panel" style="
        position: relative; z-index: 1;
        flex: 1;
        min-height: 0;
        width: 100%;
        max-width: 660px;
        padding: 58px 22px 26px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      ">
        <!-- Character name header -->
        <div style="
          flex-shrink: 0;
          font-family: Cinzel, 'Times New Roman', serif;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 3.5px;
          color: #c4a55a;
          text-transform: uppercase;
          opacity: 0.88;
        ">${char.name ?? char.id}</div>

        <!-- Chat history — flex: 1 so it fills all remaining height -->
        <div id="chat-history" style="
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          background: rgba(8,6,4,0.82);
          border: 1px solid rgba(196,165,90,0.30);
          border-radius: 2px;
          padding: 16px 18px 14px;
        "></div>

        <!-- Choices — fixed at bottom, never shrinks -->
        <div id="chat-choices" style="
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 7px;
        "></div>
      </div>
    `;

    document.body.appendChild(el);
    this._el        = el;
    this._historyEl = el.querySelector('#chat-history');
    this._choicesEl = el.querySelector('#chat-choices');

    const closeBtn = el.querySelector('#chat-close-btn');
    closeBtn.addEventListener('click', () => this.close());
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.color       = '#c4a55a';
      closeBtn.style.borderColor = 'rgba(196,165,90,0.65)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.color       = '#7a6a50';
      closeBtn.style.borderColor = 'rgba(196,165,90,0.28)';
    });

    const tradeBtn = el.querySelector('#chat-trade-btn');
    // Hide the trade button if neither side has anything to trade
    const canTrade = this._playerInv || this._character.hasInventory;
    tradeBtn.style.display = canTrade ? '' : 'none';
    tradeBtn.addEventListener('click', () => {
      if (this._playerInv) {
        this._tradeWindow.open(this._character, this._playerInv);
      }
    });
    tradeBtn.addEventListener('mouseenter', () => {
      tradeBtn.style.color       = '#c4a55a';
      tradeBtn.style.borderColor = 'rgba(196,165,90,0.65)';
    });
    tradeBtn.addEventListener('mouseleave', () => {
      tradeBtn.style.color       = '#7a6a50';
      tradeBtn.style.borderColor = 'rgba(196,165,90,0.28)';
    });

    requestAnimationFrame(() => {
      el.style.opacity   = '1';
      el.style.transform = 'translateY(0)';
    });
  }

  async _showGreeting() {
    const greeting = this._character.greeting ?? `Hello. I am ${this._character.name}.`;
    this._appendMessage(this._character.name ?? this._character.id, greeting, false);
    this._setChoicesLoading();
    try {
      const choices = await this._session.generateChoices(greeting);
      if (!this._el) return;
      this._setChoices(choices);
    } catch {
      if (!this._el) return;
      this._setChoices(['Tell me more.', 'I have a question.', 'Never mind.']);
    }
  }

  async _handleChoice(choice) {
    if (!this._el || !this._session) return;
    const playerName = this._session.player ?? 'You';
    this._appendMessage(playerName, choice, true);
    this._setChoicesLoading();
    try {
      const reply = await this._session.send(choice);
      if (!this._el) return;
      this._appendMessage(this._character.name ?? this._character.id, reply, false);
      const choices = await this._session.generateChoices(reply);
      if (!this._el) return;
      this._setChoices(choices);
    } catch (err) {
      if (!this._el) return;
      console.error('[chat] dialogue error:', err);
      const isKeyError = err.message?.includes('API key');
      this._appendMessage(
        this._character.name ?? '',
        isKeyError
          ? '⚠ OpenAI API key not configured. Add VITE_OPENAI_API_KEY to your .env file.'
          : '...',
        false
      );
      this._setChoices(['Try again.', 'Change the subject.', 'Farewell.']);
    }
  }

  _appendMessage(speakerName, text, isPlayer) {
    if (!this._historyEl) return;
    const isFirst = this._historyEl.children.length === 0;

    const msg = document.createElement('div');
    msg.style.cssText = [
      !isFirst ? 'border-top:1px solid rgba(196,165,90,0.08);padding-top:13px;margin-top:6px;' : '',
      'padding-bottom:2px; opacity:0; transition:opacity 0.35s ease;',
    ].join('');

    const nameEl = document.createElement('div');
    nameEl.style.cssText = `
      font-family: Cinzel, serif;
      font-size: 7.5px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: ${isPlayer ? '#7a9a70' : '#c4a55a'};
      opacity: 0.60;
      margin-bottom: 5px;
    `;
    nameEl.textContent = speakerName;

    const textEl = document.createElement('div');
    textEl.style.cssText = `
      color: ${isPlayer ? '#9ab890' : '#ddd5c4'};
      font-family: Georgia, serif;
      font-size: 15px;
      line-height: 1.72;
    `;
    if (isPlayer) {
      textEl.textContent = text;
    } else {
      this._renderNarrativeText(textEl, text);
    }

    msg.appendChild(nameEl);
    msg.appendChild(textEl);
    this._historyEl.appendChild(msg);

    requestAnimationFrame(() => { msg.style.opacity = '1'; });
    this._historyEl.scrollTop = this._historyEl.scrollHeight;
  }

  /**
   * Show 4 fixed-height skeleton boxes with staggered pulse animation.
   * Boxes stay the same size as the real buttons so layout never shifts.
   */
  _setChoicesLoading() {
    if (!this._choicesEl) return;
    this._choicesEl.innerHTML = '';

    const slots = [
      { label: '1', dashed: false },
      { label: '2', dashed: false },
      { label: '3', dashed: false },
      { label: '✎', dashed: true  },
    ];

    slots.forEach(({ label, dashed }, i) => {
      const div = document.createElement('div');
      div.className = 'chat-choice-loading';
      div.style.cssText = `
        border: 1px ${dashed ? 'dashed' : 'solid'} rgba(196,165,90,0.14);
        animation-delay: ${i * 0.20}s;
      `;
      div.innerHTML = `
        <span style="font-family:Cinzel,serif;font-size:9px;color:rgba(196,165,90,0.28);margin-right:12px">${label}</span>
        <span style="color:rgba(196,165,90,0.20);font-family:Georgia,serif;font-size:15px;letter-spacing:4px">· · ·</span>
      `;
      this._choicesEl.appendChild(div);
    });
  }

  _setChoices(choices) {
    if (!this._choicesEl) return;
    this._lastChoices = choices;
    this._choicesEl.innerHTML = '';

    choices.forEach((text, i) => {
      const btn = document.createElement('button');
      btn.className = 'chat-choice-btn';
      btn.innerHTML = `<span style="color:#c4a55a;font-family:Cinzel,serif;font-size:9px;letter-spacing:1px;margin-right:12px;opacity:0.72">${i + 1}</span>${this._esc(text)}`;
      btn.addEventListener('click', () => this._handleChoice(text));
      this._choicesEl.appendChild(btn);
    });

    const freeBtn = document.createElement('button');
    freeBtn.className = 'chat-choice-free';
    freeBtn.innerHTML = `<span style="font-size:12px;margin-right:10px;opacity:0.50">✎</span>Write your own response…`;
    freeBtn.addEventListener('click', () => this._openFreeInput());
    this._choicesEl.appendChild(freeBtn);
  }

  _openFreeInput() {
    if (!this._choicesEl) return;
    this._choicesEl.innerHTML = `
      <div style="display:flex;gap:8px;align-items:flex-end;">
        <textarea id="chat-free-text" placeholder="What do you say…" autocomplete="off" spellcheck="false"></textarea>
        <button id="chat-free-send" style="
          background: rgba(196,165,90,0.14);
          border: 1px solid rgba(196,165,90,0.45);
          color: #c4a55a;
          font-family: Cinzel, serif;
          font-size: 9.5px;
          letter-spacing: 2px;
          padding: 0 16px;
          height: 44px;
          cursor: pointer;
          border-radius: 2px;
          flex-shrink: 0;
          transition: background 0.15s;
        ">SAY</button>
      </div>
      <button id="chat-free-cancel" style="
        background: none; border: none;
        color: #3a3020;
        font-family: Cinzel, serif;
        font-size: 8.5px;
        letter-spacing: 2px;
        cursor: pointer;
        padding: 4px 0;
        transition: color 0.15s;
      ">← back to choices</button>
    `;

    const textarea  = this._choicesEl.querySelector('#chat-free-text');
    const sendBtn   = this._choicesEl.querySelector('#chat-free-send');
    const cancelBtn = this._choicesEl.querySelector('#chat-free-cancel');

    textarea.focus();

    const doSend = () => {
      const text = textarea.value.trim();
      if (text) this._handleChoice(text);
    };

    sendBtn.addEventListener('click', doSend);
    sendBtn.addEventListener('mouseenter', () => { sendBtn.style.background = 'rgba(196,165,90,0.24)'; });
    sendBtn.addEventListener('mouseleave', () => { sendBtn.style.background = 'rgba(196,165,90,0.14)'; });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
    });

    cancelBtn.addEventListener('click', () => {
      if (this._lastChoices) this._setChoices(this._lastChoices);
    });
    cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.color = '#7a6a50'; });
    cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.color = '#3a3020'; });
  }

  /**
   * Parse *narration* and "dialogue" segments and render them with
   * distinct styles inside `container`.
   *
   * Narration  (*...*) → italic, warm muted colour, slightly smaller
   * Dialogue   (rest)  → inherits parent colour (#ddd5c4), normal weight
   */
  _renderNarrativeText(container, text) {
    // Split on *...* spans (keep the delimiters via capturing group)
    const parts = text.split(/(\*[^*]+\*)/);
    parts.forEach(part => {
      if (!part) return;
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        // Narration segment
        const span = document.createElement('span');
        span.style.cssText = `
          font-style : italic;
          color      : #8a7860;
          font-size  : 14px;
        `;
        span.textContent = part.slice(1, -1); // strip asterisks
        container.appendChild(span);
      } else {
        // Dialogue / plain text segment — inherits parent colour
        container.appendChild(document.createTextNode(part));
      }
    });
  }

  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
