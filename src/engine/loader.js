import yaml from 'js-yaml';

/**
 * Vite glob — picks up every world.yaml at build/dev time.
 * The `?raw` query imports each file as a plain string so js-yaml can parse it.
 */
const worldGlob = import.meta.glob('../../worlds/*/world.yaml', {
  query: '?raw',
  import: 'default',
});

/**
 * Character YAML discovery — two patterns cover both folder layouts:
 *   worlds/<world>/characters/<id>/<id>.yaml  (character in own subfolder)
 *   worlds/<world>/characters/<id>.yaml        (character file at root level)
 */
const _charGlobDeep = import.meta.glob('../../worlds/*/characters/*/*.yaml', {
  query: '?raw',
  import: 'default',
});
const _charGlobFlat = import.meta.glob('../../worlds/*/characters/*.yaml', {
  query: '?raw',
  import: 'default',
});

export async function loadAllWorlds() {
  const worlds = [];

  for (const [path, load] of Object.entries(worldGlob)) {
    try {
      const raw = await load();
      const data = yaml.load(raw);
      const match = path.match(/worlds\/([^/]+)\//);
      data._folder = match ? match[1] : (data.id ?? 'unknown');
      worlds.push(data);
    } catch (err) {
      console.error(`[loader] Failed to parse ${path}:`, err);
    }
  }

  return worlds;
}

/**
 * Load all characters for a given world folder.
 * Each character object is augmented with `_assetPath` — the directory URL
 * prefix used to resolve portrait and other per-character assets, e.g.
 *   "/worlds/greywaterridge/characters/johncallahan/"
 *
 * @param {string} worldFolder  e.g. "greywaterridge"
 * @returns {Promise<object[]>}
 */
export async function loadAllCharacters(worldFolder) {
  const characters = [];
  const entries = [
    ...Object.entries(_charGlobDeep),
    ...Object.entries(_charGlobFlat),
  ];

  for (const [path, load] of entries) {
    const m = path.match(/worlds\/([^/]+)\//);
    if (!m || m[1] !== worldFolder) continue;
    try {
      const raw  = await load();
      const data = yaml.load(raw);
      // Strip leading "../../" and the filename to get the directory URL
      data._assetPath = path
        .replace(/^\.\.\/\.\./, '')
        .replace(/[^/]+\.yaml$/, '');
      characters.push(data);
    } catch (err) {
      console.error(`[loader] Failed to parse character ${path}:`, err);
    }
  }

  return characters;
}

/**
 * Fetch and parse a YAML file at runtime by URL path.
 * Returns null if the file is missing or the fetch fails.
 *
 * @param {string} path  Absolute URL path, e.g. /worlds/foo/maps/bar/bar.yaml
 * @returns {Promise<object|null>}
 */
export async function loadYaml(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return yaml.load(await res.text());
  } catch {
    return null;
  }
}

/**
 * Parse an already-fetched raw YAML string.
 *
 * @param {string} rawString
 * @returns {object}
 */
export function parseYaml(rawString) {
  return yaml.load(rawString);
}
