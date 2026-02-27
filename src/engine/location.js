import * as PIXI from 'pixi.js';
import { loadYaml, loadAllCharacters, loadAllTasks } from './loader.js';

// Portrait dimensions (pixels, relative to pin origin = circle centre)
const PW  = 68;    // portrait width
const PH  = 90;    // portrait height  (3:4 ratio)
const PY  = -86;   // portrait centre Y (above circle)
const FP  = 2;     // frame padding around portrait

/**
 * LocationManager — renders a location's background as a full-screen overlay
 * on top of the map. Characters present in the location are drawn as
 * interactive pins (portrait + name label + glow circle). Click anywhere
 * outside a character pin to return to the map.
 */
export class LocationManager {
  constructor(app, taskManager) {
    this.app              = app;
    this._taskManager     = taskManager ?? null;
    this.container        = null;
    this._onResize        = null;
    this._fadeTicker      = null;
    this._tickerCallbacks = [];   // halo ticker fns for character pins
    this._charPins        = [];   // [{ pinContainer, cx, cy }]
    this._taskPins        = [];   // [{ pinContainer, cx, cy }]
  }

  /**
   * Show a location scene.
   *
   * @param {string}   locationId   Location id (matches folder + yaml file name)
   * @param {string}   worldFolder  World folder name
   * @param {string}   mapId        Parent map id
   * @param {Function} onBack       Called when the player clicks to return to the map
   */
  async show(locationId, worldFolder, mapId, onBack) {
    this._cleanup();

    const locData = await loadYaml(
      `/worlds/${worldFolder}/maps/${mapId}/${locationId}/${locationId}.yaml`
    );
    if (!locData) {
      console.error(`[location] YAML not found: ${locationId}`);
      return;
    }
    console.log(`[location] entered: ${locData.id}`);

    const container = new PIXI.Container();
    container.alpha = 0;
    this.app.stage.addChild(container);
    this.container = container;

    // ── Background ──────────────────────────────────────────────────────────
    let bg = null;
    if (locData.background) {
      const url = `/worlds/${worldFolder}/maps/${mapId}/${locationId}/${locData.background}`;
      try {
        const texture = await PIXI.Assets.load(url);
        bg = new PIXI.Sprite(texture);
        this._fitSprite(bg);
        container.addChild(bg);
      } catch (err) {
        console.warn(`[location] background failed to load: ${url}`, err);
      }
    }

    // Solid dark base as fallback when no background is available
    if (!bg) {
      const base = new PIXI.Graphics();
      const { width, height } = this.app.screen;
      base.rect(0, 0, width, height).fill({ color: 0x0d0d0f });
      container.addChildAt(base, 0);
    }

    // Dark vignette overlay so text stays readable over any image
    const vignette = new PIXI.Graphics();
    this._drawVignette(vignette);
    container.addChild(vignette);

    // ── Character pins ───────────────────────────────────────────────────────
    const allChars     = await loadAllCharacters(worldFolder);
    const locChars     = allChars.filter(c => c.location === locationId);
    const assignments  = this._assignCharacterPositions(
      locChars,
      locData.character_positions ?? []
    );
    for (const { char, pos } of assignments) {
      await this._addCharacterPin(char, pos, container);
    }

    // ── Location title ───────────────────────────────────────────────────────
    const title = new PIXI.Text({
      text: (locData.title ?? locData.id).toUpperCase(),
      style: {
        fontFamily: 'Cinzel, "Times New Roman", serif',
        fontSize: 26,
        fontWeight: '600',
        fill: 0xc4a55a,
        letterSpacing: 6,
      },
    });
    title.anchor.set(0.5, 0.5);
    title.x = this.app.screen.width  / 2;
    title.y = this.app.screen.height * 0.42;
    container.addChild(title);

    // Optional description text below the title
    let descText = null;
    if (locData.text) {
      descText = new PIXI.Text({
        text: locData.text,
        style: {
          fontFamily: '"Crimson Text", Georgia, serif',
          fontSize: 15,
          fill: 0x8a7a60,
          fontStyle: 'italic',
          align: 'center',
          wordWrap: true,
          wordWrapWidth: Math.min(this.app.screen.width * 0.55, 460),
        },
      });
      descText.anchor.set(0.5, 0);
      descText.x = this.app.screen.width / 2;
      descText.y = title.y + 24;
      container.addChild(descText);
    }

    // Subtle "click to return" hint at the bottom
    const hint = new PIXI.Text({
      text: 'CLICK TO RETURN',
      style: {
        fontFamily: 'Cinzel, "Times New Roman", serif',
        fontSize: 9,
        fill: 0x4a4030,
        letterSpacing: 3,
      },
    });
    hint.anchor.set(0.5, 1);
    hint.x = this.app.screen.width  / 2;
    hint.y = this.app.screen.height - 28;
    container.addChild(hint);

    // ── Task pins (rendered after title so they sit on top) ───────────────
    if (this._taskManager) {
      const tasks = await loadAllTasks(worldFolder, mapId, locationId);
      for (const taskData of tasks) {
        const record = this._taskManager.addTaskPin(taskData, container, (td) => {
          this._taskManager.showTaskScreen(td, () => {
            // After sleep or when Night falls, auto-close back to the map
            if (td.action === 'sleep' || this._taskManager.dayCycle?.isNight) {
              this._fadeTo(0, 350, () => {
                this._cleanup();
                onBack?.();
              });
            }
          });
        });
        if (record) this._taskPins.push(record);
      }
    }

    // Full-screen hit area for click-to-return
    container.eventMode = 'static';
    container.hitArea   = new PIXI.Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
    container.cursor    = 'pointer';

    // ── Resize ──────────────────────────────────────────────────────────────
    this._onResize = () => {
      const { width, height } = this.app.screen;
      if (bg) this._fitSprite(bg);
      this._drawVignette(vignette);
      title.x = width  / 2;
      title.y = height * 0.42;
      if (descText) {
        descText.x = width / 2;
        descText.y = title.y + 24;
        descText.style.wordWrapWidth = Math.min(width * 0.55, 460);
      }
      hint.x  = width  / 2;
      hint.y  = height - 28;
      container.hitArea = new PIXI.Rectangle(0, 0, width, height);
      for (const { pinContainer, cx, cy } of this._charPins) {
        pinContainer.x = (cx / 100) * width;
        pinContainer.y = (cy / 100) * height;
      }
      for (const { pinContainer, cx, cy } of this._taskPins) {
        pinContainer.x = (cx / 100) * width;
        pinContainer.y = (cy / 100) * height;
      }
    };
    window.addEventListener('resize', this._onResize);

    // ── Fade in, then wait for click ─────────────────────────────────────
    this._fadeTo(1, 500);

    container.on('pointertap', () => {
      this._fadeTo(0, 350, () => {
        this._cleanup();
        onBack?.();
      });
    });
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Match each character to a position in the location's character_positions list.
   * Characters with a positionkeyword are matched to positions whose keywords
   * array includes that keyword. Unmatched characters fall back to the first
   * unused position.
   */
  _assignCharacterPositions(characters, positions) {
    if (!positions || positions.length === 0) return [];

    const used      = new Set();
    const unmatched = [];
    const result    = [];

    // First pass — keyword matching
    for (const char of characters) {
      const kw  = char.positionkeyword;
      let   idx = -1;
      if (kw) {
        idx = positions.findIndex((p, i) =>
          !used.has(i) && Array.isArray(p.keywords) && p.keywords.includes(kw)
        );
      }
      if (idx !== -1) {
        used.add(idx);
        result.push({ char, pos: positions[idx].pos });
      } else {
        unmatched.push(char);
      }
    }

    // Second pass — fallback to first available slot
    for (const char of unmatched) {
      let fallback = -1;
      for (let i = 0; i < positions.length; i++) {
        if (!used.has(i)) { fallback = i; break; }
      }
      if (fallback !== -1) {
        used.add(fallback);
        result.push({ char, pos: positions[fallback].pos });
      }
    }

    return result;
  }

  /**
   * Build and add a single interactive character pin.
   * Layout (relative to pin origin = circle centre):
   *   - Name label   — just above the portrait frame
   *   - Portrait     — 48×48 px square sprite with golden frame
   *   - Circle dot   — at origin (0, 0), same style as map location pins
   */
  async _addCharacterPin(charData, pos, container) {
    const [cx, cy] = pos;

    const pin = new PIXI.Container();
    pin.eventMode = 'static';
    pin.cursor    = 'pointer';
    pin.x = (cx / 100) * this.app.screen.width;
    pin.y = (cy / 100) * this.app.screen.height;

    // ── Portrait group — frame + sprite together so they scale as one unit ──
    // Always created; scales from portrait centre (container origin = PY on pin).
    const portraitContainer = new PIXI.Container();
    portraitContainer.x = 0;
    portraitContainer.y = PY;
    pin.addChild(portraitContainer);

    // Frame coords are local to portraitContainer (origin = portrait centre)
    const frame = new PIXI.Graphics();
    const drawFrame = (hovered) => {
      frame.clear();
      frame
        .rect(-(PW / 2 + FP), -PH / 2 - FP, PW + FP * 2, PH + FP * 2)
        .fill({ color: 0x1a1410, alpha: 0.85 })
        .stroke({
          color: hovered ? 0xd4b870 : 0xc4a55a,
          width: hovered ? 2 : 1.5,
          alpha: hovered ? 0.95 : 0.75,
        });
    };
    drawFrame(false);
    portraitContainer.addChild(frame);

    // Portrait sprite (async) — also added to portraitContainer
    if (charData.portrait && charData._assetPath) {
      const url = charData._assetPath + charData.portrait;
      try {
        const texture = await PIXI.Assets.load(url);
        const portrait = new PIXI.Sprite(texture);
        portrait.anchor.set(0.5, 0.5);
        portrait.width  = PW;
        portrait.height = PH;

        // Rectangular clip mask — local coords
        const mask = new PIXI.Graphics();
        mask.rect(-PW / 2, -PH / 2, PW, PH).fill(0xffffff);
        portrait.mask = mask;
        portraitContainer.addChild(mask);
        portraitContainer.addChild(portrait);
      } catch {
        console.warn(`[location] portrait not found: ${charData._assetPath + charData.portrait}`);
      }
    }

    // ── Ambient soft glow ─────────────────────────────────────────────────
    const glow = new PIXI.Graphics();
    glow.circle(0, 0, 16).fill({ color: 0xc4a55a, alpha: 0.08 });
    pin.addChild(glow);

    // ── Animated halo ring ────────────────────────────────────────────────
    const halo = new PIXI.Graphics();
    pin.addChild(halo);

    // ── Circle dot ────────────────────────────────────────────────────────
    const dot = new PIXI.Graphics();
    const drawDot = (hovered) => {
      dot.clear();
      if (hovered) {
        dot.circle(0, 0, 9)
           .fill({ color: 0xc4a55a, alpha: 1 })
           .stroke({ color: 0xffffff, width: 1.5, alpha: 0.9 });
      } else {
        dot.circle(0, 0, 7)
           .fill({ color: 0xc4a55a, alpha: 0.85 })
           .stroke({ color: 0xddd5c4, width: 1.5, alpha: 0.7 });
      }
    };
    drawDot(false);
    pin.addChild(dot);

    // ── Name label — between portrait bottom and circle ──────────────────
    const label = new PIXI.Text({
      text: charData.name ?? charData.id,
      style: {
        fontFamily: 'Cinzel, "Times New Roman", serif',
        fontSize: 10,
        fontWeight: '400',
        fill: 0xddd5c4,
        letterSpacing: 1,
      },
    });
    label.anchor.set(0.5, 1);
    label.y     = -16;   // bottom of text sits between frame bottom and circle
    label.alpha = 0.75;
    pin.addChild(label);

    // ── Halo animation ────────────────────────────────────────────────────
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
    this._tickerCallbacks.push(tickHalo);

    // ── Hover ─────────────────────────────────────────────────────────────
    pin.on('pointerenter', () => {
      haloTarget = 1;
      drawFrame(true);
      drawDot(true);
      portraitContainer.scale.set(1.05);
      label.alpha            = 1;
      label.style.fontSize   = 12;
      label.style.fontWeight = '600';
      label.style.fill       = 0xffffff;
    });

    pin.on('pointerleave', () => {
      haloTarget = 0;
      drawFrame(false);
      drawDot(false);
      portraitContainer.scale.set(1.0);
      label.alpha            = 0.75;
      label.style.fontSize   = 10;
      label.style.fontWeight = '400';
      label.style.fill       = 0xddd5c4;
    });

    // Stop propagation so clicking a character doesn't trigger click-to-return
    pin.on('pointertap', (e) => {
      e.stopPropagation();
      console.log(`[location] character tapped: ${charData.id} (${charData.name ?? charData.id})`);
    });

    container.addChild(pin);
    this._charPins.push({ pinContainer: pin, cx, cy });
  }

  _fitSprite(sprite) {
    const { width, height } = this.app.screen;
    const s = Math.max(
      width  / sprite.texture.width,
      height / sprite.texture.height
    );
    sprite.scale.set(s);
    sprite.x = (width  - sprite.texture.width  * s) / 2;
    sprite.y = (height - sprite.texture.height * s) / 2;
  }

  _drawVignette(g) {
    const { width, height } = this.app.screen;
    g.clear();
    g.rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.40 });
  }

  /** Animate container.alpha toward `target` over `ms` ms via Ticker. */
  _fadeTo(target, ms, onComplete) {
    if (this._fadeTicker) {
      PIXI.Ticker.shared.remove(this._fadeTicker);
      this._fadeTicker = null;
    }
    const container = this.container;
    if (!container) return;

    const start    = container.alpha;
    const duration = ms;
    let   elapsed  = 0;

    this._fadeTicker = () => {
      elapsed += PIXI.Ticker.shared.deltaMS;
      const t = Math.min(elapsed / duration, 1);
      container.alpha = start + (target - start) * t;
      if (t >= 1) {
        PIXI.Ticker.shared.remove(this._fadeTicker);
        this._fadeTicker = null;
        onComplete?.();
      }
    };
    PIXI.Ticker.shared.add(this._fadeTicker);
  }

  _cleanup() {
    if (this._fadeTicker) {
      PIXI.Ticker.shared.remove(this._fadeTicker);
      this._fadeTicker = null;
    }
    for (const fn of this._tickerCallbacks) {
      PIXI.Ticker.shared.remove(fn);
    }
    this._tickerCallbacks = [];
    this._charPins        = [];
    this._taskPins        = [];
    if (this._taskManager) this._taskManager.cleanupPins();

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

  destroy() { this._cleanup(); }
}
