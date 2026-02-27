import { MapManager }      from './map.js';
import { LocationManager }  from './location.js';
import { TaskManager }      from './task.js';
import { FlagStore }        from './flags.js';
import { Inventory }        from './inventory.js';
import { DayCycle }         from './daycycle.js';
import { HUD }              from '../ui/hud.js';
import { loadAllItems }     from './loader.js';
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
    this._taskManager      = null;
    this._flagStore        = new FlagStore();
    this._inventory        = new Inventory();
    this._dayCycle         = null;
    this._hud              = null;
    this._itemDefs         = new Map();
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
    if (this._taskManager)     this._taskManager.destroy();
    if (this._hud)             this._hud.destroy();

    // Load item definitions for this world
    const itemsList = await loadAllItems(worldData._folder);
    this._itemDefs = new Map();
    for (const item of itemsList) {
      this._itemDefs.set(item.id, item);
    }

    this._dayCycle        = new DayCycle();
    this._hud             = new HUD(app, this._inventory, this._itemDefs, this._dayCycle);
    this._taskManager     = new TaskManager(app, this._flagStore, this._inventory, this._itemDefs, this._hud, this._dayCycle);
    this._dayCycle.onChange(() => {
      this._hud.refreshTime();
      // Toggle night mode on the map when the time segment changes
      if (this._mapManager) {
        this._mapManager.setNightMode(this._dayCycle.isNight);
      }
    });
    this._locationManager = new LocationManager(app, this._taskManager);
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
