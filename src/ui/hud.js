import * as PIXI from 'pixi.js';

const BAR_H     = 42;     // top bar height
const BADGE_R   = 10;     // count badge radius
const PANEL_W   = 340;    // inventory panel width
const SLOT_SIZE = 72;     // item slot size in the grid
const SLOT_GAP  = 10;     // gap between slots
const COLS      = 4;      // grid columns
const PIP_R     = 5;      // action pip radius

/**
 * HUD — a top-of-screen bar with an inventory button and count badge.
 * Clicking the button opens an inventory panel overlay.
 */
export class HUD {
  /**
   * @param {import('pixi.js').Application} app
   * @param {import('../engine/inventory.js').Inventory} inventory
   * @param {Map<string,object>} itemDefs  id → item YAML (with _assetPath)
   * @param {import('../engine/daycycle.js').DayCycle} dayCycle
   */
  constructor(app, inventory, itemDefs, dayCycle) {
    this.app       = app;
    this.inventory = inventory;
    this.itemDefs  = itemDefs;
    this.dayCycle  = dayCycle;

    // Top bar container — always on top
    this.container = new PIXI.Container();
    this.container.zIndex = 100;
    app.stage.addChild(this.container);

    // Panel state
    this._panelContainer = null;
    this._panelOpen      = false;
    this._onResize       = null;

    this._buildBar();
    this._setupResize();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Top bar
  // ══════════════════════════════════════════════════════════════════════════

  _buildBar() {
    const { width } = this.app.screen;

    // Dark translucent bar
    this._bar = new PIXI.Graphics();
    this._drawBar();
    this.container.addChild(this._bar);

    // Inventory button
    this._btn = new PIXI.Container();
    this._btn.eventMode = 'static';
    this._btn.cursor    = 'pointer';
    this._btn.x = width - 20;
    this._btn.y = BAR_H / 2;
    this.container.addChild(this._btn);

    // Button label
    this._btnText = new PIXI.Text({
      text: 'INVENTORY',
      style: {
        fontFamily: 'Cinzel, "Times New Roman", serif',
        fontSize: 11,
        fontWeight: '600',
        fill: 0x9a8a6a,
        letterSpacing: 3,
      },
    });
    this._btnText.anchor.set(1, 0.5);
    this._btn.addChild(this._btnText);

    // Count badge (circle + number)
    this._badge = new PIXI.Container();
    this._badge.x = -this._btnText.width - 14;
    this._btn.addChild(this._badge);

    this._badgeBg = new PIXI.Graphics();
    this._badge.addChild(this._badgeBg);

    this._badgeText = new PIXI.Text({
      text: '0',
      style: {
        fontFamily: 'Cinzel, "Times New Roman", serif',
        fontSize: 10,
        fontWeight: '700',
        fill: 0x0d0d0f,
      },
    });
    this._badgeText.anchor.set(0.5, 0.5);
    this._badge.addChild(this._badgeText);

    this.refresh();

    // Hover
    this._btn.on('pointerenter', () => {
      this._btnText.style.fill = 0xffffff;
    });
    this._btn.on('pointerleave', () => {
      this._btnText.style.fill = 0x9a8a6a;
    });

    // Click
    this._btn.on('pointertap', (e) => {
      e.stopPropagation();
      this._togglePanel();
    });

    // ── Day / time display (left side) ───────────────────────────────────
    this._dayLabel = new PIXI.Text({
      text: this.dayCycle.label,
      style: {
        fontFamily: 'Cinzel, "Times New Roman", serif',
        fontSize: 12,
        fontWeight: '600',
        fill: 0xc4a55a,
        letterSpacing: 2,
      },
    });
    this._dayLabel.anchor.set(0, 0.5);
    this._dayLabel.x = 20;
    this._dayLabel.y = BAR_H / 2;
    this.container.addChild(this._dayLabel);

    // Action pips — small circles to the right of the label
    this._pips = new PIXI.Graphics();
    this.container.addChild(this._pips);
    this._drawPips();
  }

  _drawBar() {
    const { width } = this.app.screen;
    this._bar.clear();
    this._bar.rect(0, 0, width, BAR_H)
             .fill({ color: 0x0a0a0c, alpha: 0.55 });
    // Subtle bottom border
    this._bar.rect(0, BAR_H - 1, width, 1)
             .fill({ color: 0xc4a55a, alpha: 0.08 });
  }

  /** Update the badge to reflect current inventory count. */
  refresh() {
    const count = this.inventory.count;
    this._badgeText.text = String(count);

    this._badgeBg.clear();
    if (count > 0) {
      this._badgeBg.circle(0, 0, BADGE_R)
                   .fill({ color: 0xc4a55a, alpha: 0.9 });
      this._badge.visible = true;
    } else {
      this._badge.visible = false;
    }

    // Reposition badge relative to text width
    this._badge.x = -this._btnText.width - 14;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Day / time
  // ══════════════════════════════════════════════════════════════════════════

  /** Redraw the day label text and action pips from current DayCycle state. */
  refreshTime() {
    this._dayLabel.text = this.dayCycle.label;
    this._drawPips();
  }

  _drawPips() {
    this._pips.clear();
    const startX = this._dayLabel.x + this._dayLabel.width + 14;
    const cy     = BAR_H / 2;

    for (let i = 0; i < this.dayCycle.maxActions; i++) {
      const cx    = startX + i * (PIP_R * 2 + 8);
      const filled = i < this.dayCycle.actionsRemaining;
      this._pips.circle(cx, cy, PIP_R)
                .fill({ color: filled ? 0xc4a55a : 0x2a2a30, alpha: filled ? 0.9 : 0.5 });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Inventory panel
  // ══════════════════════════════════════════════════════════════════════════

  _togglePanel() {
    if (this._panelOpen) {
      this._closePanel();
    } else {
      this._openPanel();
    }
  }

  async _openPanel() {
    if (this._panelContainer) this._closePanel();
    this._panelOpen = true;

    const { width, height } = this.app.screen;

    const panel = new PIXI.Container();
    panel.zIndex = 99;
    this.app.stage.addChild(panel);
    this._panelContainer = panel;

    // Click-to-close backdrop
    const backdrop = new PIXI.Graphics();
    backdrop.rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.45 });
    backdrop.eventMode = 'static';
    backdrop.cursor    = 'default';
    backdrop.on('pointertap', (e) => {
      e.stopPropagation();
      this._closePanel();
    });
    panel.addChild(backdrop);

    // Panel background — right-aligned, below bar
    const panelX = width - PANEL_W - 16;
    const panelY = BAR_H + 8;

    const panelBg = new PIXI.Graphics();
    panel.addChild(panelBg);

    // Title
    const title = new PIXI.Text({
      text: 'INVENTORY',
      style: {
        fontFamily: 'Cinzel, "Times New Roman", serif',
        fontSize: 16,
        fontWeight: '600',
        fill: 0xc4a55a,
        letterSpacing: 4,
      },
    });
    title.x = panelX + 20;
    title.y = panelY + 16;
    panel.addChild(title);

    // Group items by id → count quantities
    const grouped = new Map();
    for (const item of this.inventory.items) {
      const cur = grouped.get(item.id) || { id: item.id, qty: 0 };
      cur.qty++;
      grouped.set(item.id, cur);
    }

    const entries = [...grouped.values()];
    const gridTop = panelY + 52;
    const gridLeft = panelX + 20;
    const rows = Math.max(Math.ceil(entries.length / COLS), 1);
    const panelH = 52 + rows * (SLOT_SIZE + SLOT_GAP) + SLOT_GAP + 16;

    // Draw panel bg now that we know height
    panelBg.roundRect(panelX, panelY, PANEL_W, panelH, 6)
           .fill({ color: 0x111116, alpha: 0.95 })
           .stroke({ color: 0xc4a55a, width: 1, alpha: 0.2 });

    if (entries.length === 0) {
      const empty = new PIXI.Text({
        text: 'No items yet.',
        style: {
          fontFamily: '"Crimson Text", Georgia, serif',
          fontSize: 15,
          fill: 0x5a5040,
          fontStyle: 'italic',
        },
      });
      empty.x = panelX + PANEL_W / 2;
      empty.y = gridTop + 20;
      empty.anchor.set(0.5, 0);
      panel.addChild(empty);
    }

    // Item slots
    for (let i = 0; i < entries.length; i++) {
      const { id, qty } = entries[i];
      const def = this.itemDefs.get(id);
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const sx  = gridLeft + col * (SLOT_SIZE + SLOT_GAP);
      const sy  = gridTop  + row * (SLOT_SIZE + SLOT_GAP);

      // Slot background
      const slotBg = new PIXI.Graphics();
      slotBg.roundRect(sx, sy, SLOT_SIZE, SLOT_SIZE, 4)
            .fill({ color: 0x1a1a20, alpha: 0.8 })
            .stroke({ color: 0xc4a55a, width: 1, alpha: 0.12 });
      panel.addChild(slotBg);

      // Item image
      if (def?.image && def._assetPath) {
        try {
          const tex = await PIXI.Assets.load(def._assetPath + def.image);
          const sprite = new PIXI.Sprite(tex);
          sprite.width  = SLOT_SIZE - 16;
          sprite.height = SLOT_SIZE - 16;
          sprite.x = sx + 8;
          sprite.y = sy + 4;
          panel.addChild(sprite);
        } catch { /* image not found */ }
      }

      // Quantity label
      if (qty > 1) {
        const qtyLabel = new PIXI.Text({
          text: `\u00d7${qty}`,
          style: {
            fontFamily: 'Cinzel, "Times New Roman", serif',
            fontSize: 12,
            fontWeight: '700',
            fill: 0xffffff,
            stroke: { color: 0x000000, width: 3 },
          },
        });
        qtyLabel.anchor.set(1, 1);
        qtyLabel.x = sx + SLOT_SIZE - 4;
        qtyLabel.y = sy + SLOT_SIZE - 2;
        panel.addChild(qtyLabel);
      }

      // Item name below slot
      const name = new PIXI.Text({
        text: def?.name ?? id,
        style: {
          fontFamily: '"Crimson Text", Georgia, serif',
          fontSize: 10,
          fill: 0x8a7a60,
          align: 'center',
        },
      });
      name.anchor.set(0.5, 0);
      name.x = sx + SLOT_SIZE / 2;
      name.y = sy + SLOT_SIZE + 2;
      panel.addChild(name);
    }

    // Block propagation on the panel area itself
    panelBg.eventMode = 'static';
    panelBg.on('pointertap', (e) => e.stopPropagation());
  }

  _closePanel() {
    if (this._panelContainer) {
      this.app.stage.removeChild(this._panelContainer);
      this._panelContainer.destroy({ children: true });
      this._panelContainer = null;
    }
    this._panelOpen = false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Resize / lifecycle
  // ══════════════════════════════════════════════════════════════════════════

  _setupResize() {
    this._onResize = () => {
      this._drawBar();
      this._btn.x = this.app.screen.width - 20;
      // Close panel on resize (simpler than repositioning everything)
      if (this._panelOpen) this._closePanel();
    };
    window.addEventListener('resize', this._onResize);
  }

  /** Return the screen position of the inventory button (for fly-to animations). */
  getButtonPosition() {
    return {
      x: this._btn.x,
      y: this._btn.y,
    };
  }

  show() { this.container.visible = true; }
  hide() { this.container.visible = false; }

  destroy() {
    this._closePanel();
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
      this._onResize = null;
    }
    if (this.container.parent) {
      this.container.parent.removeChild(this.container);
    }
    this.container.destroy({ children: true });
  }
}
