import * as PIXI from 'pixi.js';
import { loadYaml } from './loader.js';

/**
 * MapManager — loads a map YAML, renders its background image on the PixiJS
 * stage, and places an interactive circle pin for each location defined in the
 * map's `locations` array.
 *
 * Pins respond to hover (enlarge + show label) and tap/click (fires callback).
 * All positions are percentage-based so they remain correct on resize.
 */
export class MapManager {
  constructor(app) {
    this.app             = app;
    this.container       = null;
    this._bg             = null;
    this._pins           = [];   // [{ pinContainer, cx, cy, locId }]
    this._onResize       = null;
    this._tickerCallbacks = [];  // ticker fns to remove on cleanup
  }

  /**
   * Load and render a map.
   *
   * @param {string}   mapId            Map id (must match folder + yaml file name)
   * @param {string}   worldFolder      World folder name under worlds/
   * @param {Function} onLocationClick  Called with locData when a pin is clicked
   */
  async load(mapId, worldFolder, onLocationClick) {
    this._cleanup();

    this.container = new PIXI.Container();
    this.app.stage.addChild(this.container);

    // ── Load map YAML ──────────────────────────────────────────────────────
    const mapData = await loadYaml(
      `/worlds/${worldFolder}/maps/${mapId}/${mapId}.yaml`
    );
    if (!mapData) {
      console.error(`[map] YAML not found: ${mapId}`);
      return;
    }
    console.log(`[map] loaded: ${mapData.id}`);

    // ── Background ─────────────────────────────────────────────────────────
    if (mapData.background) {
      const url = `/worlds/${worldFolder}/maps/${mapId}/${mapData.background}`;
      try {
        const texture = await PIXI.Assets.load(url);
        this._bg = new PIXI.Sprite(texture);
        this._fitBg();
        this.container.addChildAt(this._bg, 0);
      } catch (err) {
        console.warn(`[map] background failed to load: ${url}`, err);
      }
    }

    // ── Location pins ──────────────────────────────────────────────────────
    for (const locationId of (mapData.locations ?? [])) {
      const locData = await loadYaml(
        `/worlds/${worldFolder}/maps/${mapId}/${locationId}/${locationId}.yaml`
      );
      if (!locData) {
        console.warn(`[map] location YAML not found: ${locationId}`);
        continue;
      }
      this._addPin(locData, onLocationClick);
    }

    // ── Resize handler (single, shared) ───────────────────────────────────
    this._onResize = () => {
      if (this._bg) this._fitBg();
      for (const { pinContainer, cx, cy } of this._pins) {
        pinContainer.x = (cx / 100) * this.app.screen.width;
        pinContainer.y = (cy / 100) * this.app.screen.height;
      }
    };
    window.addEventListener('resize', this._onResize);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /** Cover-fit the background sprite to the full canvas. */
  _fitBg() {
    const { width, height } = this.app.screen;
    const s = Math.max(
      width  / this._bg.texture.width,
      height / this._bg.texture.height
    );
    this._bg.scale.set(s);
    this._bg.x = (width  - this._bg.texture.width  * s) / 2;
    this._bg.y = (height - this._bg.texture.height * s) / 2;
  }

  /** Add an interactive location pin to the stage. */
  _addPin(locData, onLocationClick) {
    const [cx, cy] = locData.coordinates ?? [50, 50];

    const pin = new PIXI.Container();
    pin.eventMode = 'static';
    pin.cursor    = 'pointer';

    // Ambient soft glow (always visible, static)
    const glow = new PIXI.Graphics();
    glow.circle(0, 0, 18).fill({ color: 0xc4a55a, alpha: 0.10 });
    pin.addChild(glow);

    // Animated halo ring — grows outward on hover
    const halo = new PIXI.Graphics();
    pin.addChild(halo);

    // Main dot (redrawn on hover state change)
    const dot = new PIXI.Graphics();
    this._drawDot(dot, false);
    pin.addChild(dot);

    // Location name label — hidden until hover
    const label = new PIXI.Text({
      text: locData.title ?? locData.id,
      style: {
        fontFamily: 'Cinzel, "Times New Roman", serif',
        fontSize: 11,
        fontWeight: '400',
        fill: 0xddd5c4,
        letterSpacing: 2,
      },
    });
    label.anchor.set(0.5, 1);
    label.y     = -20;
    label.alpha =  0;
    pin.addChild(label);

    // Percentage → pixels
    pin.x = (cx / 100) * this.app.screen.width;
    pin.y = (cy / 100) * this.app.screen.height;

    // ── Halo animation via Ticker ────────────────────────────────────────
    let haloTarget = 0;   // 0 = rest, 1 = hovered
    let haloT      = 0;   // current animated progress

    const tickHalo = () => {
      haloT += (haloTarget - haloT) * 0.12;
      halo.clear();
      if (haloT > 0.005) {
        const r     = 12 + haloT * 10;   // grows from 12 → 22 px
        const alpha = haloT * 0.55;
        halo.circle(0, 0, r).stroke({ color: 0xc4a55a, width: 1, alpha });
      }
    };

    PIXI.Ticker.shared.add(tickHalo);
    this._tickerCallbacks.push(tickHalo);

    // ── Hover events ─────────────────────────────────────────────────────
    pin.on('pointerenter', () => {
      haloTarget = 1;
      this._drawDot(dot, true);
      label.alpha          = 1;
      label.style.fontSize = 13;
      label.style.fontWeight = '600';
      label.style.fill     = 0xffffff;
    });

    pin.on('pointerleave', () => {
      haloTarget = 0;
      this._drawDot(dot, false);
      label.alpha          = 0;
      label.style.fontSize = 11;
      label.style.fontWeight = '400';
      label.style.fill     = 0xddd5c4;
    });

    pin.on('pointertap', () => onLocationClick?.(locData));

    this.container.addChild(pin);
    this._pins.push({ pinContainer: pin, cx, cy, locId: locData.id });
  }

  /**
   * Toggle night mode — dims and disables all location pins except the inn.
   * @param {boolean} enabled
   */
  setNightMode(enabled) {
    for (const pin of this._pins) {
      const isInn = pin.locId === 'crimshawinn';
      if (enabled && !isInn) {
        pin.pinContainer.alpha     = 0.2;
        pin.pinContainer.eventMode = 'none';
        pin.pinContainer.cursor    = 'default';
      } else {
        pin.pinContainer.alpha     = 1;
        pin.pinContainer.eventMode = 'static';
        pin.pinContainer.cursor    = 'pointer';
      }
    }
  }

  /** Draw (or redraw) the dot graphic for normal / hovered state. */
  _drawDot(g, hovered) {
    g.clear();
    if (hovered) {
      g.circle(0, 0, 10)
       .fill({ color: 0xc4a55a, alpha: 1 })
       .stroke({ color: 0xffffff, width: 1.5, alpha: 0.9 });
    } else {
      g.circle(0, 0, 7)
       .fill({ color: 0xc4a55a, alpha: 0.85 })
       .stroke({ color: 0xddd5c4, width: 1.5, alpha: 0.7 });
    }
  }

  /** Remove the container, resize listener, and all ticker callbacks. */
  _cleanup() {
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
    this._bg   = null;
    this._pins = [];
  }

  destroy() { this._cleanup(); }
}
