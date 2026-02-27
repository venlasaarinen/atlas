/**
 * Character — runtime representation of an NPC loaded from YAML.
 */
export class Character {
  constructor(data) {
    this.data     = data;
    this.id       = data.id;
    this.name     = data.name;
    this.portrait = data.portrait ?? null;
    this.location = data.location ?? null;
    // _runtimeInventory lives on data so it persists across Character instances
    // built from the same charData object (e.g. re-opening the chat window).
    // Populated lazily via _initInventory(itemDefs).
  }

  get persona()     { return this.data.ai?.persona     ?? ''; }
  get knowledge()   { return this.data.ai?.knowledge   ?? ''; }
  get environment() { return this.data.ai?.environment ?? ''; }
  get greeting()    { return this.data.dialogue?.greeting ?? `Hello, I am ${this.name}.`; }

  // ── Inventory ───────────────────────────────────────────────────────────────

  /**
   * Resolve raw YAML inventory entries ({ item: id, quantity: N }) to full
   * item definitions. Stored on `this.data` so the result survives multiple
   * Character instances created from the same charData.
   *
   * @param {Map<string,object>} itemDefs  World item definitions keyed by id
   */
  _initInventory(itemDefs) {
    if (this.data._runtimeInventory) return; // already resolved
    const raw = this.data.inventory ?? [];
    this.data._runtimeInventory = raw
      .map(entry => {
        const def = itemDefs?.get(entry.item);
        if (!def) {
          console.warn(`[character] unknown item in inventory: "${entry.item}"`);
          return null;
        }
        return { def, quantity: entry.quantity ?? 1 };
      })
      .filter(Boolean);
  }

  /** @returns {{ def: object, quantity: number }[]} */
  get inventoryItems() {
    return this.data._runtimeInventory ?? [];
  }

  /** True if the character has at least one item. */
  get hasInventory() {
    return this.inventoryItems.length > 0;
  }

  /**
   * Remove `qty` of `itemId`. Returns false if stock is insufficient.
   * @param {string} itemId
   * @param {number} qty
   */
  removeItem(itemId, qty = 1) {
    const inv   = this.data._runtimeInventory;
    if (!inv) return false;
    const entry = inv.find(e => e.def.id === itemId);
    if (!entry || entry.quantity < qty) return false;
    entry.quantity -= qty;
    if (entry.quantity <= 0) {
      this.data._runtimeInventory = inv.filter(e => e.def.id !== itemId);
    }
    return true;
  }

  /**
   * Add `qty` of `itemDef` to the character's inventory.
   * @param {object} itemDef  Full item definition object
   * @param {number} qty
   */
  addItem(itemDef, qty = 1) {
    if (!this.data._runtimeInventory) this.data._runtimeInventory = [];
    const existing = this.data._runtimeInventory.find(e => e.def.id === itemDef.id);
    if (existing) {
      existing.quantity += qty;
    } else {
      this.data._runtimeInventory.push({ def: itemDef, quantity: qty });
    }
  }
}

export async function loadCharacter(characterId, worldFolder) {
  throw new Error(`loadCharacter not yet implemented (wanted: ${characterId})`);
}
