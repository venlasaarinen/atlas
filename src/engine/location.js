/**
 * LocationManager — tracks the player's current location within a map.
 */
export class LocationManager {
  constructor(worldManager) {
    this.world = worldManager;
    this.currentLocation = null;
  }

  async enter(locationId) {
    // TODO: load worlds/<folder>/locations/<locationId>.yaml
    // TODO: fire on_enter events
    // TODO: update HUD, spawn character sprites
    console.log(`[location] enter: ${locationId}`);
  }

  get characters() {
    return this.currentLocation?.characters ?? [];
  }
}
