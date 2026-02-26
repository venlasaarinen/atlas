/**
 * Character — runtime representation of an NPC loaded from YAML.
 */
export class Character {
  constructor(data) {
    this.data = data;
    this.id = data.id;
    this.name = data.name;
    this.portrait = data.portrait ?? null;
    this.location = data.location ?? null;
    this.inventory = [];
  }

  get persona() {
    return this.data.ai?.persona ?? '';
  }

  get knowledge() {
    return this.data.ai?.knowledge ?? '';
  }

  get greeting() {
    return this.data.dialogue?.greeting ?? `Hello, I am ${this.name}.`;
  }
}

/**
 * Load and return a Character instance for the given id.
 * (Implementation pending map/loader integration.)
 *
 * @param {string} characterId
 * @param {string} worldFolder
 * @returns {Promise<Character>}
 */
export async function loadCharacter(characterId, worldFolder) {
  // TODO: fetch worlds/<worldFolder>/characters/<characterId>.yaml via loader
  throw new Error(`loadCharacter not yet implemented (wanted: ${characterId})`);
}
