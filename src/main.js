import { initCanvas } from './ui/canvas.js';
import { showTitleScreen } from './ui/titlescreen.js';
import { loadAllWorlds } from './engine/loader.js';
import { WorldManager } from './engine/world.js';
import { initDevTools } from './ui/devtools.js';
import { initApiDebug } from './ui/apidebug.js';

const worldManager = new WorldManager();

async function main() {
  const app = await initCanvas();
  initDevTools();
  initApiDebug();

  let worlds = [];
  try {
    worlds = await loadAllWorlds();
  } catch (err) {
    console.error('[atlas] Failed to load worlds:', err);
  }

  showTitleScreen(worlds, async (worldData) => {
    await worldManager.load(worldData, app);
  });
}

main().catch(err => {
  console.error('[atlas] Engine failed to start:', err);
});
