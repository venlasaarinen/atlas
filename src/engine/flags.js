/**
 * FlagStore — key/value story state that persists for the duration of a
 * play session. Used by the event system for condition checks.
 */
export class FlagStore {
  constructor() {
    this._flags = new Map();
  }

  set(key, value) {
    this._flags.set(key, value);
  }

  get(key, defaultValue = false) {
    return this._flags.has(key) ? this._flags.get(key) : defaultValue;
  }

  reset() {
    this._flags.clear();
  }

  toObject() {
    return Object.fromEntries(this._flags);
  }
}
