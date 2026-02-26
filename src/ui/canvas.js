import { Application, Graphics } from 'pixi.js';

let app = null;

export async function initCanvas() {
  app = new Application();

  await app.init({
    resizeTo: window,
    backgroundColor: 0x0d0d0f,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });

  document.getElementById('game-canvas').appendChild(app.canvas);

  // Solid background rect so the canvas owns its colour
  const bg = new Graphics();
  const drawBg = () => {
    bg.clear();
    bg.rect(0, 0, app.screen.width, app.screen.height);
    bg.fill(0x0d0d0f);
  };
  drawBg();
  app.stage.addChild(bg);
  app.renderer.on('resize', drawBg);

  return app;
}

export function getApp() {
  return app;
}
