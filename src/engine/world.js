import { MapManager }      from './map.js';
import { LocationManager }  from './location.js';
import { audioManager }     from './audio.js';

/**
 * WorldManager — holds the active world state and delegates map and location
 * rendering to their respective managers.
 */
export class WorldManager {
  constructor() {
    this.currentWorld      = null;
    this._mapManager       = null;
    this._locationManager  = null;
  }

  /**
   * Load a world and render its start map.
   *
   * @param {object} worldData  Parsed world.yaml object (with _folder attached)
   * @param {import('pixi.js').Application} app
   */
  async load(worldData, app) {
    this.currentWorld = worldData;
    console.log(`[world] loaded: ${worldData.id}`);

    // Fade out the intro soundtrack as the map loads
    audioManager.fadeOut(2000);

    if (this._mapManager)      this._mapManager.destroy();
    if (this._locationManager) this._locationManager.destroy();

    this._locationManager = new LocationManager(app);
    this._mapManager      = new MapManager(app);

    await this._mapManager.load(
      worldData.start_map,
      worldData._folder,
      (locData) => {
        this._locationManager.show(
          locData.id,
          worldData._folder,
          worldData.start_map,
          () => {} // map stays alive underneath — nothing to do on return
        );
      }
    );
  }
}
