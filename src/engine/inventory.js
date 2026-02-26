/**
 * Inventory — a simple item bag for the player or an NPC.
 */
export class Inventory {
  constructor() {
    this.items = [];
  }

  add(item) {
    this.items.push(item);
  }

  remove(itemId) {
    const idx = this.items.findIndex(i => i.id === itemId);
    if (idx !== -1) this.items.splice(idx, 1);
  }

  has(itemId) {
    return this.items.some(i => i.id === itemId);
  }

  get(itemId) {
    return this.items.find(i => i.id === itemId) ?? null;
  }

  get count() {
    return this.items.length;
  }
}
