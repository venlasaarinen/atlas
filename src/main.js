import { initCanvas } from './ui/canvas.js';
import { showTitleScreen } from './ui/titlescreen.js';
import { loadAllWorlds } from './engine/loader.js';
import { WorldManager } from './engine/world.js';

const worldManager = new WorldManager();

async function main() {
  const app = await initCanvas();

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
