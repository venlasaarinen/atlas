import { Text, Container } from 'pixi.js';

/**
 * WorldManager — holds the active world state and renders a placeholder
 * scene until the map renderer is implemented.
 */
export class WorldManager {
  constructor() {
    this.currentWorld = null;
    this._container = null;
    this._resizeHandler = null;
  }

  /**
   * Load a world and mount a placeholder view on the PixiJS stage.
   *
   * @param {object} worldData  Parsed world.yaml object (with _folder attached)
   * @param {import('pixi.js').Application} app
   */
  async load(worldData, app) {
    this.currentWorld = worldData;

    // Clean up previous world
    if (this._container) {
      if (this._resizeHandler) {
        app.renderer.off('resize', this._resizeHandler);
      }
      app.stage.removeChild(this._container);
      this._container.destroy({ children: true });
    }

    this._container = new Container();

    const title = new Text({
      text: worldData.title ?? worldData.id,
      style: {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: 34,
        fill: 0xc4a55a,
        align: 'center',
      },
    });
    title.anchor.set(0.5);

    const mapLabel = new Text({
      text: `start map: ${worldData.start_map ?? '—'}`,
      style: {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: 15,
        fill: 0x6b6055,
        align: 'center',
      },
    });
    mapLabel.anchor.set(0.5);

    const hint = new Text({
      text: '[ map renderer coming soon ]',
      style: {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: 11,
        fill: 0x2a2520,
        align: 'center',
      },
    });
    hint.anchor.set(0.5);

    this._container.addChild(title, mapLabel, hint);
    app.stage.addChild(this._container);

    const position = () => {
      const cx = app.screen.width / 2;
      const cy = app.screen.height / 2;
      title.position.set(cx, cy - 28);
      mapLabel.position.set(cx, cy + 18);
      hint.position.set(cx, cy + 56);
    };

    position();
    this._resizeHandler = position;
    app.renderer.on('resize', this._resizeHandler);

    console.log(`[world] loaded: ${worldData.id}`);
  }
}
