import yaml from 'js-yaml';

/**
 * Vite glob — picks up every world.yaml at build/dev time.
 * The `?raw` query imports each file as a plain string so js-yaml can parse it.
 */
const worldGlob = import.meta.glob('../../worlds/*/world.yaml', {
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
 * Load a single YAML file by path (relative to project root).
 * Useful for loading maps, characters, and events on demand.
 *
 * @param {string} rawString  Already-fetched raw YAML string
 * @returns {object}
 */
export function parseYaml(rawString) {
  return yaml.load(rawString);
}
