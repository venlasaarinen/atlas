import { Container, Text } from 'pixi.js';

/**
 * HUD overlay — displays current location, player name, etc.
 * Rendered as a PixiJS container layered above the game scene.
 */
export class HUD {
  constructor(app) {
    this.app = app;
    this.container = new Container();
    app.stage.addChild(this.container);
  }

  setLocation(locationTitle) {
    // TODO: display current location in the HUD
  }

  setPlayerName(name) {
    // TODO: display player name in the HUD
  }

  show() {
    this.container.visible = true;
  }

  hide() {
    this.container.visible = false;
  }
}
