/**
 * MapManager — loads and renders a map, handles exits to other maps.
 */
export class MapManager {
  constructor(worldManager) {
    this.world = worldManager;
    this.currentMap = null;
  }

  async load(mapId) {
    // TODO: load worlds/<folder>/maps/<mapId>.yaml
    // TODO: render background sprite, set up exit zones
    // TODO: fire on_enter events
    console.log(`[map] load: ${mapId}`);
  }

  transition(exitId) {
    // TODO: look up exit in currentMap.exits, load connected map
    console.log(`[map] transition via exit: ${exitId}`);
  }
}
