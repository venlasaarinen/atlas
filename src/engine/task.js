import * as PIXI from 'pixi.js';

/**
 * TaskManager — handles task pin rendering on location screens and the
 * full-screen task overlay (title, description, outcomes, slot-machine
 * roulette animation, and outcome reveal with FlagStore persistence).
 */
export class TaskManager {
  constructor(app, flagStore, inventory, itemDefs, hud, dayCycle) {
    this.app       = app;
    this.flagStore = flagStore;
    this.inventory = inventory;
    this.itemDefs  = itemDefs;     // Map<id, itemData>
    this.hud       = hud;
    this.dayCycle  = dayCycle;

    // Task screen overlay
    this.container        = null;
    this._onResize        = null;
    this._fadeTicker      = null;
    this._tickerCallbacks = [];

    // Task pins placed on the location screen (for resize tracking)
    this._taskPins           = [];
    this._pinTickerCallbacks = [];
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Task pins (rendered on the location screen)
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Create a small interactive dot for a task on the location overlay.
   * Style matches the map location pins (glow + halo + dot + label on hover).
   *
   * @param {object}         taskData  Parsed task YAML with `type: task`
   * @param {PIXI.Container} parent    The location overlay container
   * @param {Function}       onClick   Called with `taskData` when the pin is tapped
   * @returns {{ pinContainer: PIXI.Container, cx: number, cy: number }}
   */
  addTaskPin(taskData, parent, onClick) {
    // Sleep task only visible at Night
    if (taskData.action === 'sleep' && !this.dayCycle?.isNight) return null;

    const [cx, cy] = taskData.coordinates ?? [50, 50];

    const pin = new PIXI.Container();
    pin.eventMode = 'static';
    pin.cursor    = 'pointer';

    // Ambient soft glow (static)
    const glow = new PIXI.Graphics();
    glow.circle(0, 0, 16).fill({ color: 0xc4a55a, alpha: 0.08 });
    pin.addChild(glow);

    // Animated halo ring
    const halo = new PIXI.Graphics();
    pin.addChild(halo);

    // Main dot
    const dot = new PIXI.Graphics();
    this._drawDot(dot, false);
    pin.addChild(dot);

    // Title label — always visible for sleep pins, hover-only for others
    const alwaysShowLabel = taskData.action === 'sleep';
    const label = new PIXI.Text({
      text: taskData.title ?? taskData.id,
      style: {
        fontFamily: 'Cinzel, "Times New Roman", serif',
        fontSize: alwaysShowLabel ? 12 : 10,
        fontWeight: alwaysShowLabel ? '600' : '400',
        fill: alwaysShowLabel ? 0xc4a55a : 0xddd5c4,
        letterSpacing: 2,
      },
    });
    label.anchor.set(0.5, 1);
    label.y     = -18;
    label.alpha = alwaysShowLabel ? 1 : 0;
    pin.addChild(label);

    // Position (percentage -> pixels)
    pin.x = (cx / 100) * this.app.screen.width;
    pin.y = (cy / 100) * this.app.screen.height;

    // Halo animation via Ticker
    let haloTarget = 0;
    let haloT      = 0;
    const tickHalo = () => {
      haloT += (haloTarget - haloT) * 0.12;
      halo.clear();
      if (haloT > 0.005) {
        halo
          .circle(0, 0, 10 + haloT * 10)
          .stroke({ color: 0xc4a55a, width: 1, alpha: haloT * 0.55 });
      }
    };
    PIXI.Ticker.shared.add(tickHalo);
    this._pinTickerCallbacks.push(tickHalo);

    // Hover
    pin.on('pointerenter', () => {
      haloTarget = 1;
      this._drawDot(dot, true);
      label.alpha            = 1;
      label.style.fontSize   = 12;
      label.style.fontWeight = '600';
      label.style.fill       = 0xffffff;
    });
    pin.on('pointerleave', () => {
      haloTarget = 0;
      this._drawDot(dot, false);
      label.alpha            = 0;
      label.style.fontSize   = 10;
      label.style.fontWeight = '400';
      label.style.fill       = 0xddd5c4;
    });

    // Tap — stop propagation so it doesn't trigger click-to-return
    pin.on('pointertap', (e) => {
      e.stopPropagation();
      onClick?.(taskData);
    });

    parent.addChild(pin);
    const record = { pinContainer: pin, cx, cy };
    this._taskPins.push(record);
    return record;
  }

  /** Draw (or redraw) the task dot graphic. */
  _drawDot(g, hovered) {
    g.clear();
    if (hovered) {
      g.circle(0, 0, 9)
       .fill({ color: 0xc4a55a, alpha: 1 })
       .stroke({ color: 0xffffff, width: 1.5, alpha: 0.9 });
    } else {
      g.circle(0, 0, 7)
       .fill({ color: 0xc4a55a, alpha: 0.85 })
       .stroke({ color: 0xddd5c4, width: 1.5, alpha: 0.7 });
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Task screen overlay
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Show the full-screen task overlay.
   *
   * @param {object}   taskData  Parsed task YAML
   * @param {Function} onBack    Called when the player leaves the task screen
   */
  showTaskScreen(taskData, onBack) {
    // Sleep tasks get a dedicated screen instead of the roulette
    if (taskData.action === 'sleep') {
      this._showSleepScreen(onBack);
      return;
    }

    this._cleanupScreen();

    const { width, height } = this.app.screen;
    const MAX_TIER = 3; // only tiers 1-3 visible (no bonuses yet)
    const visibleOutcomes = (taskData.outcomes ?? []).slice(0, MAX_TIER);

    const container = new PIXI.Container();
    container.alpha = 0;
    this.app.stage.addChild(container);
    this.container = container;

    // ── Dark background ────────────────────────────────────────────────────
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, width, height).fill({ color: 0x0d0d0f, alpha: 0.92 });
    container.addChild(bg);

    // ── Task title ─────────────────────────────────────────────────────────
    const title = new PIXI.Text({
      text: (taskData.title ?? taskData.id).toUpperCase(),
      style: {
        fontFamily: 'Cinzel, "Times New Roman", serif',
        fontSize: 28,
        fontWeight: '600',
        fill: 0xc4a55a,
        letterSpacing: 6,
      },
    });
    title.anchor.set(0.5, 0);
    title.x = width / 2;
    title.y = height * 0.10;
    container.addChild(title);

    // ── Description text ───────────────────────────────────────────────────
    const desc = new PIXI.Text({
      text: taskData.text ?? '',
      style: {
        fontFamily: '"Crimson Text", Georgia, serif',
        fontSize: 16,
        fill: 0x9a9080,
        wordWrap: true,
        wordWrapWidth: Math.min(width * 0.55, 520),
        lineHeight: 24,
        align: 'center',
      },
    });
    desc.anchor.set(0.5, 0);
    desc.x = width / 2;
    desc.y = height * 0.20;
    container.addChild(desc);

    // ── Outcomes list ──────────────────────────────────────────────────────
    const OUTCOME_H   = 60;
    const listTop     = height * 0.40;
    const outcomeRows = [];

    for (let i = 0; i < visibleOutcomes.length; i++) {
      const flagKey = `task_${taskData.id}_outcome_${i}_seen`;
      const seen    = this.flagStore.get(flagKey, false);

      const row = new PIXI.Container();
      row.x = width / 2;
      row.y = listTop + i * OUTCOME_H;

      // Highlight background (hidden initially, used during animation)
      const hlBg = new PIXI.Graphics();
      row.addChild(hlBg);

      // Outcome text or "???"
      const oText = new PIXI.Text({
        text: seen ? visibleOutcomes[i].text : '? ? ?',
        style: seen ? {
          fontFamily: '"Crimson Text", Georgia, serif',
          fontSize: 17,
          fill: 0xddd5c4,
          wordWrap: true,
          wordWrapWidth: Math.min(width * 0.50, 460),
          align: 'center',
        } : {
          fontFamily: 'Cinzel, "Times New Roman", serif',
          fontSize: 22,
          fontWeight: '600',
          fill: 0x7a6a50,
          letterSpacing: 6,
        },
      });
      oText.anchor.set(0.5, 0.5);
      row.addChild(oText);

      // Divider
      const halfW = Math.min(width * 0.30, 260);
      const div = new PIXI.Graphics();
      div.rect(-halfW, OUTCOME_H / 2 - 0.5, halfW * 2, 1)
         .fill({ color: 0xc4a55a, alpha: 0.08 });
      row.addChild(div);

      container.addChild(row);
      outcomeRows.push({ row, oText, hlBg });
    }

    // ── START button ───────────────────────────────────────────────────────
    const startBtn = this._createButton('START', width / 2, height * 0.74);
    startBtn.on('pointertap', (e) => {
      e.stopPropagation();
      // Hide buttons during animation
      startBtn.visible = false;
      backBtn.visible  = false;
      this._runSlotMachine(taskData, visibleOutcomes, outcomeRows,
                           OUTCOME_H, listTop, container, onBack);
    });
    container.addChild(startBtn);

    // ── BACK button ────────────────────────────────────────────────────────
    const backBtn = this._createButton('BACK', width / 2, height * 0.83, true);
    backBtn.on('pointertap', (e) => {
      e.stopPropagation();
      this._fadeTo(0, 350, () => {
        this._cleanupScreen();
        onBack?.();
      });
    });
    container.addChild(backBtn);

    // Block clicks from reaching the location layer
    container.eventMode = 'static';
    container.hitArea   = new PIXI.Rectangle(0, 0, width, height);

    // ── Resize ─────────────────────────────────────────────────────────────
    this._onResize = () => {
      const { width: w, height: h } = this.app.screen;
      bg.clear().rect(0, 0, w, h).fill({ color: 0x0d0d0f, alpha: 0.92 });
      title.x = w / 2;   title.y = h * 0.10;
      desc.x  = w / 2;   desc.y  = h * 0.20;
      desc.style.wordWrapWidth = Math.min(w * 0.55, 520);
      for (let i = 0; i < outcomeRows.length; i++) {
        outcomeRows[i].row.x = w / 2;
        outcomeRows[i].row.y = h * 0.40 + i * OUTCOME_H;
      }
      startBtn.x = w / 2;  startBtn.y = h * 0.74;
      backBtn.x  = w / 2;  backBtn.y  = h * 0.83;
      container.hitArea = new PIXI.Rectangle(0, 0, w, h);
    };
    window.addEventListener('resize', this._onResize);

    // Fade in
    this._fadeTo(1, 500);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Bouncing-highlight roulette animation
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Roll the dice and play a bouncing highlight animation over the static
   * tier rows. The highlight moves top→bottom, wraps back to top, and
   * decelerates until it lands on the winning tier.
   */
  _runSlotMachine(taskData, visibleOutcomes, outcomeRows, outcomeH, listTop,
                  screenContainer, onBack) {
    // ── Dice roll ──────────────────────────────────────────────────────────
    const roll      = Math.floor(Math.random() * 6) + 1;   // 1d6
    const tierIndex = Math.min(Math.floor((roll - 1) / 2),
                               visibleOutcomes.length - 1);

    const { width } = this.app.screen;
    const n = visibleOutcomes.length;

    // Build a sequence of indices the highlight visits.
    // It cycles through 0,1,2,0,1,2,… for CYCLES full passes, then continues
    // from 0 up to the winning tierIndex.
    const CYCLES = 4;
    const sequence = [];
    for (let c = 0; c < CYCLES; c++) {
      for (let i = 0; i < n; i++) sequence.push(i);
    }
    for (let i = 0; i <= tierIndex; i++) sequence.push(i);

    // Helper: draw / clear the highlight rect on a row
    const halfW = Math.min(width * 0.30, 260);
    const setHighlight = (idx, on) => {
      const { hlBg } = outcomeRows[idx];
      hlBg.clear();
      if (on) {
        hlBg.roundRect(-halfW, -outcomeH / 2 + 4, halfW * 2, outcomeH - 8, 4)
            .fill({ color: 0xc4a55a, alpha: 0.14 })
            .stroke({ color: 0xc4a55a, width: 1, alpha: 0.35 });
      }
    };

    let step      = 0;
    let interval  = 40;          // ms between highlights (starts fast)
    const DECEL   = 1.22;        // multiplier each step
    const MAX_INT = 180;         // slowest interval before final landing
    let prevIdx   = -1;

    const advance = () => {
      // Clear previous highlight
      if (prevIdx >= 0) setHighlight(prevIdx, false);

      const curIdx = sequence[step];
      setHighlight(curIdx, true);
      prevIdx = curIdx;
      step++;

      // If we've reached the end of the sequence, land
      if (step >= sequence.length) {
        // Final landing — keep highlight, then reveal
        setTimeout(() => {
          setHighlight(curIdx, false);
          this._revealOutcome(taskData, tierIndex, visibleOutcomes,
                              outcomeRows, null, screenContainer, onBack);
        }, 800);
        return;
      }

      // Decelerate
      interval = Math.min(interval * DECEL, MAX_INT);
      this._spinTimeout = setTimeout(advance, interval);
    };

    advance();
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Outcome reveal
  // ════════════════════════════════════════════════════════════════════════════

  async _revealOutcome(taskData, tierIndex, visibleOutcomes, outcomeRows,
                       reelArea, screenContainer, onBack) {
    // Persist discovery
    const flagKey = `task_${taskData.id}_outcome_${tierIndex}_seen`;
    this.flagStore.set(flagKey, true);

    // Remove reel if it exists (not used in bouncing-highlight mode)
    if (reelArea) {
      if (reelArea.parent) reelArea.parent.removeChild(reelArea);
      reelArea.destroy({ children: true });
    }

    // Update the won row with a persistent highlight
    const { width, height } = this.app.screen;
    const halfW = Math.min(width * 0.30, 260);
    for (let i = 0; i < outcomeRows.length; i++) {
      const { row, oText, hlBg } = outcomeRows[i];
      row.visible = true;

      if (i === tierIndex) {
        // Reveal this outcome
        oText.text               = visibleOutcomes[i].text;
        oText.style.fontFamily   = '"Crimson Text", Georgia, serif';
        oText.style.fontSize     = 17;
        oText.style.fontWeight   = '400';
        oText.style.fill         = 0xffeebb;
        oText.style.letterSpacing = 0;
        oText.style.wordWrap     = true;
        oText.style.wordWrapWidth = Math.min(width * 0.50, 460);
        oText.style.align        = 'center';
        oText.anchor.set(0.5, 0.5);
        oText.x = 0;
        // Show winning highlight
        hlBg.clear();
        hlBg.roundRect(-halfW, -30 + 4, halfW * 2, 60 - 8, 4)
            .fill({ color: 0xc4a55a, alpha: 0.18 })
            .stroke({ color: 0xc4a55a, width: 1.5, alpha: 0.5 });
      }
    }

    // ── Item rewards ───────────────────────────────────────────────────────
    const rewards = visibleOutcomes[tierIndex].rewards ?? [];
    const totalItems = rewards.reduce((sum, r) => sum + (r.qty ?? 0), 0);

    if (totalItems === 0) {
      // No rewards — show effect text and CONTINUE immediately
      const effect = new PIXI.Text({
        text: visibleOutcomes[tierIndex].outcome ?? 'No effect',
        style: {
          fontFamily: 'Cinzel, "Times New Roman", serif',
          fontSize: 20,
          fontWeight: '600',
          fill: 0xc4a55a,
          letterSpacing: 3,
          align: 'center',
        },
      });
      effect.anchor.set(0.5, 0.5);
      effect.x = width / 2;
      effect.y = height * 0.72;
      screenContainer.addChild(effect);

      const backBtn = this._createButton('CONTINUE', width / 2, height * 0.82, false);
      backBtn.on('pointertap', (e) => {
        e.stopPropagation();
        this.dayCycle.consumeAction();
        this._fadeTo(0, 350, () => {
          this._cleanupScreen();
          onBack?.();
        });
      });
      screenContainer.addChild(backBtn);
      return;
    }

    // Build flat list of individual item sprites to claim
    let claimed     = 0;
    let spriteIndex = 0;
    const SPRITE_SIZE = 90;

    // Layout positions — spread items in a loose cluster
    const positions = this._getRewardPositions(totalItems, width, height);

    // Prepare the CONTINUE button (hidden until all claimed)
    const continueBtn = this._createButton('CONTINUE', width / 2, height * 0.88, false);
    continueBtn.visible = false;
    continueBtn.on('pointertap', (e) => {
      e.stopPropagation();
      this.dayCycle.consumeAction();
      this._fadeTo(0, 350, () => {
        this._cleanupScreen();
        onBack?.();
      });
    });
    screenContainer.addChild(continueBtn);

    for (const reward of rewards) {
      const def = this.itemDefs.get(reward.item);
      if (!def) continue;

      let texture = null;
      if (def.image && def._assetPath) {
        try {
          texture = await PIXI.Assets.load(def._assetPath + def.image);
        } catch { /* missing */ }
      }

      for (let q = 0; q < (reward.qty ?? 1); q++) {
        const pos = positions[spriteIndex] ?? { x: width / 2, y: height * 0.68 };
        spriteIndex++;

        const itemContainer = new PIXI.Container();
        itemContainer.x = pos.x;
        itemContainer.y = pos.y;
        itemContainer.eventMode = 'static';
        itemContainer.cursor    = 'pointer';
        screenContainer.addChild(itemContainer);

        // Glow behind the sprite
        const glow = new PIXI.Graphics();
        glow.circle(0, 0, SPRITE_SIZE * 0.55)
            .fill({ color: 0xc4a55a, alpha: 0.12 });
        itemContainer.addChild(glow);

        // Item sprite
        if (texture) {
          const sprite = new PIXI.Sprite(texture);
          sprite.anchor.set(0.5, 0.5);
          sprite.width  = SPRITE_SIZE;
          sprite.height = SPRITE_SIZE;
          itemContainer.addChild(sprite);
        }

        // Floating bob animation
        const baseY = pos.y;
        const bobOffset = Math.random() * Math.PI * 2;
        const tickBob = () => {
          itemContainer.y = baseY + Math.sin(Date.now() / 500 + bobOffset) * 4;
        };
        PIXI.Ticker.shared.add(tickBob);
        this._tickerCallbacks.push(tickBob);

        // Click to claim
        itemContainer.on('pointertap', (e) => {
          e.stopPropagation();

          // Remove bob
          PIXI.Ticker.shared.remove(tickBob);

          // Add to inventory
          this.inventory.add({ id: reward.item });
          if (this.hud) this.hud.refresh();

          // Fly-to-inventory animation
          const hudPos = this.hud?.getButtonPosition() ?? { x: width - 20, y: 21 };
          this._flyToInventory(itemContainer, hudPos, screenContainer);

          claimed++;
          if (claimed >= totalItems) {
            // All items claimed — show CONTINUE
            continueBtn.visible = true;
          }
        });
      }
    }
  }

  /** Calculate scattered positions for N reward sprites. */
  _getRewardPositions(count, w, h) {
    const cx = w / 2;
    const cy = h * 0.68;
    const positions = [];

    if (count === 1) {
      positions.push({ x: cx, y: cy });
    } else if (count === 2) {
      positions.push({ x: cx - 60, y: cy });
      positions.push({ x: cx + 60, y: cy });
    } else if (count === 3) {
      positions.push({ x: cx,      y: cy - 35 });
      positions.push({ x: cx - 55, y: cy + 30 });
      positions.push({ x: cx + 55, y: cy + 30 });
    } else {
      // Spread in a loose grid
      const cols = Math.min(count, 4);
      const rows = Math.ceil(count / cols);
      for (let i = 0; i < count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        positions.push({
          x: cx + (col - (cols - 1) / 2) * 80,
          y: cy + (row - (rows - 1) / 2) * 80,
        });
      }
    }
    return positions;
  }

  /** Animate a sprite flying to the inventory button and disappearing. */
  _flyToInventory(itemContainer, targetPos, parent) {
    const startX = itemContainer.x;
    const startY = itemContainer.y;
    const startScale = itemContainer.scale.x;
    const duration = 450;
    let elapsed = 0;

    const tick = () => {
      elapsed += PIXI.Ticker.shared.deltaMS;
      const t = Math.min(elapsed / duration, 1);
      // Ease-in-out
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      itemContainer.x     = startX + (targetPos.x - startX) * e;
      itemContainer.y     = startY + (targetPos.y - startY) * e;
      itemContainer.scale.set(startScale * (1 - e * 0.8));
      itemContainer.alpha = 1 - e * 0.6;

      if (t >= 1) {
        PIXI.Ticker.shared.remove(tick);
        if (itemContainer.parent) itemContainer.parent.removeChild(itemContainer);
        itemContainer.destroy({ children: true });
      }
    };

    PIXI.Ticker.shared.add(tick);
    this._tickerCallbacks.push(tick);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Sleep screen
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Show a dreamy night-sky screen with stars.
   * Pressing CONTINUE advances the day cycle to the next morning.
   */
  _showSleepScreen(onBack) {
    this._cleanupScreen();

    const { width, height } = this.app.screen;

    const container = new PIXI.Container();
    container.alpha = 0;
    this.app.stage.addChild(container);
    this.container = container;

    // ── Dark night sky ─────────────────────────────────────────────────────
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, width, height).fill({ color: 0x050510, alpha: 0.96 });
    container.addChild(bg);

    // ── Stars ──────────────────────────────────────────────────────────────
    const STAR_COUNT = 50;
    const stars = [];
    const starGfx = new PIXI.Graphics();
    container.addChild(starGfx);

    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x:     Math.random() * width,
        y:     Math.random() * height * 0.7,   // keep stars in upper 70%
        r:     0.8 + Math.random() * 2.2,      // radius 0.8 – 3
        base:  0.15 + Math.random() * 0.55,    // base alpha 0.15 – 0.70
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.7,      // twinkle speed
      });
    }

    const drawStars = () => {
      starGfx.clear();
      const t = Date.now() / 1000;
      for (const s of stars) {
        const twinkle = s.base + Math.sin(t * s.speed + s.phase) * 0.25;
        const alpha   = Math.max(0.05, Math.min(1, twinkle));
        starGfx.circle(s.x, s.y, s.r).fill({ color: 0xffffff, alpha });
      }
    };
    drawStars();

    const tickStars = () => drawStars();
    PIXI.Ticker.shared.add(tickStars);
    this._tickerCallbacks.push(tickStars);

    // ── Text ───────────────────────────────────────────────────────────────
    const line1 = new PIXI.Text({
      text: 'You sleep...',
      style: {
        fontFamily: 'Cinzel, "Times New Roman", serif',
        fontSize: 26,
        fontWeight: '600',
        fill: 0xc4a55a,
        letterSpacing: 4,
      },
    });
    line1.anchor.set(0.5, 0.5);
    line1.x = width / 2;
    line1.y = height * 0.40;
    container.addChild(line1);

    const line2 = new PIXI.Text({
      text: '...until morning',
      style: {
        fontFamily: '"Crimson Text", Georgia, serif',
        fontSize: 18,
        fill: 0x8a7a60,
        fontStyle: 'italic',
      },
    });
    line2.anchor.set(0.5, 0.5);
    line2.x = width / 2;
    line2.y = height * 0.48;
    container.addChild(line2);

    // ── CONTINUE button ────────────────────────────────────────────────────
    const continueBtn = this._createButton('CONTINUE', width / 2, height * 0.75, false);
    continueBtn.on('pointertap', (e) => {
      e.stopPropagation();
      this.dayCycle.sleep();
      this._fadeTo(0, 500, () => {
        this._cleanupScreen();
        onBack?.();
      });
    });
    container.addChild(continueBtn);

    // Block clicks from reaching layers below
    container.eventMode = 'static';
    container.hitArea   = new PIXI.Rectangle(0, 0, width, height);

    // ── Resize ─────────────────────────────────────────────────────────────
    this._onResize = () => {
      const { width: w, height: h } = this.app.screen;
      bg.clear().rect(0, 0, w, h).fill({ color: 0x050510, alpha: 0.96 });
      line1.x = w / 2;  line1.y = h * 0.40;
      line2.x = w / 2;  line2.y = h * 0.48;
      continueBtn.x = w / 2;  continueBtn.y = h * 0.75;
      container.hitArea = new PIXI.Rectangle(0, 0, w, h);
      // Redistribute stars
      for (const s of stars) {
        s.x = Math.random() * w;
        s.y = Math.random() * h * 0.7;
      }
    };
    window.addEventListener('resize', this._onResize);

    // Fade in
    this._fadeTo(1, 600);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Shared UI helpers
  // ════════════════════════════════════════════════════════════════════════════

  /** Create a styled button with hover effects. */
  _createButton(label, x, y, subtle = false) {
    const btn = new PIXI.Container();
    btn.eventMode = 'static';
    btn.cursor    = 'pointer';
    btn.x = x;
    btn.y = y;

    const PAD_X = subtle ? 52 : 72;
    const PAD_Y = subtle ? 16 : 22;

    const bg = new PIXI.Graphics();
    const drawBg = (hovered) => {
      bg.clear();
      bg.roundRect(-PAD_X, -PAD_Y, PAD_X * 2, PAD_Y * 2, 4)
        .fill({ color: hovered ? 0x1a1610 : 0x111110, alpha: 0.85 })
        .stroke({
          color: subtle && !hovered ? 0x3a3430 : 0xc4a55a,
          width: subtle ? 1 : 1.5,
          alpha: hovered ? 0.75 : (subtle ? 0.35 : 0.5),
        });
    };
    drawBg(false);
    btn.addChild(bg);

    const text = new PIXI.Text({
      text: label,
      style: {
        fontFamily: 'Cinzel, "Times New Roman", serif',
        fontSize: subtle ? 13 : 16,
        fontWeight: subtle ? '400' : '700',
        fill: subtle ? 0x7a6a50 : 0xc4a55a,
        letterSpacing: 5,
      },
    });
    text.anchor.set(0.5, 0.5);
    btn.addChild(text);

    btn.on('pointerenter', () => {
      drawBg(true);
      text.style.fill = 0xffffff;
    });
    btn.on('pointerleave', () => {
      drawBg(false);
      text.style.fill = subtle ? 0x7a6a50 : 0xc4a55a;
    });

    return btn;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Fade / cleanup
  // ════════════════════════════════════════════════════════════════════════════

  /** Animate container.alpha toward `target` over `ms` milliseconds. */
  _fadeTo(target, ms, onComplete) {
    if (this._fadeTicker) {
      PIXI.Ticker.shared.remove(this._fadeTicker);
      this._fadeTicker = null;
    }
    const container = this.container;
    if (!container) return;

    const start   = container.alpha;
    let   elapsed = 0;

    this._fadeTicker = () => {
      elapsed += PIXI.Ticker.shared.deltaMS;
      const t = Math.min(elapsed / ms, 1);
      container.alpha = start + (target - start) * t;
      if (t >= 1) {
        PIXI.Ticker.shared.remove(this._fadeTicker);
        this._fadeTicker = null;
        onComplete?.();
      }
    };
    PIXI.Ticker.shared.add(this._fadeTicker);
  }

  /** Remove only the task screen overlay (pins survive). */
  _cleanupScreen() {
    if (this._spinTimeout) {
      clearTimeout(this._spinTimeout);
      this._spinTimeout = null;
    }
    if (this._fadeTicker) {
      PIXI.Ticker.shared.remove(this._fadeTicker);
      this._fadeTicker = null;
    }
    for (const fn of this._tickerCallbacks) {
      PIXI.Ticker.shared.remove(fn);
    }
    this._tickerCallbacks = [];

    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
      this._onResize = null;
    }
    if (this.container) {
      this.app.stage.removeChild(this.container);
      this.container.destroy({ children: true });
      this.container = null;
    }
  }

  /** Remove task pins from the location screen (called when leaving a location). */
  cleanupPins() {
    for (const fn of this._pinTickerCallbacks) {
      PIXI.Ticker.shared.remove(fn);
    }
    this._pinTickerCallbacks = [];
    this._taskPins           = [];
  }

  /** Full teardown. */
  destroy() {
    this.cleanupPins();
    this._cleanupScreen();
  }
}
