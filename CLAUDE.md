# Atlas — Story Game Engine

## Project Overview

Atlas is a data-driven story game engine for AI-powered narrative games. Players explore worlds and interact with characters via AI chat. The engine runs in the browser using HTML Canvas rendered by PixiJS.

## Architecture

### Core Concepts

- **World** — a self-contained game with its own characters, maps, scenes, and dialogue data
- **Map** — a collection of locations within a world that can connect to other maps (a village, forest, or castle)
- **Location** — a discrete location within a map (a room, area, or point of interest)
- **Character** — an NPC with a personality, backstory, and AI chat persona
- **Dialogue** — AI-driven conversation using character persona data as context
- **Event** — a story trigger tied to conditions (location, inventory, flags, etc.)
- **Items** - a character or the player character can have items in their inventory


### Folder Structure

```
Atlas/
├── CLAUDE.md
├── index.html
├── package.json
├── src/
│   ├── engine/          # Core engine systems
│   │   ├── world.js     # World loader and manager
│   │   ├── map.js       # Maps renderer and transitions
│   │   ├── location.js  # Location renderer and transitions
│   │   ├── character.js # Character state and AI chat integration
│   │   ├── dialogue.js  # AI chat interface and conversation history
│   │   ├── events.js    # Event system and condition evaluation
│   │   ├── inventory.js # Player inventory system
│   │   ├── flags.js     # Story flag / state management
│   │   └── loader.js    # YAML data loader
│   ├── ui/              # PixiJS UI components
│   │   ├── canvas.js    # PixiJS app setup and canvas management
│   │   ├── hud.js       # HUD overlay
│   │   └── chat.js      # Chat window UI
│   └── main.js          # Entry point
├── worlds/              # All game worlds (data-driven, YAML)
│   └── example-world/
│       ├── world.yaml   # World metadata and config
│       ├── characters/  # One subdirectory per character which includes one YAML file and any assets for that character
│       ├── maps/        # One subdirectory per map which includes one YAML file and any assets for that map
│       ├── maps/{mapid}/locations/   # Locations within the map. One subdirectory per location which includes one YAML file and any assets for that location
│       ├── items/       # Item definitions
│       ├── events/      # Event and trigger definitions
│       └── assets/      # Sprites, audio, etc. for this world
└── shared/              # Assets shared across worlds
```

### Data Layer (YAML)

All game content is defined in YAML. The engine is purely a runtime — no content lives in JS.

**`worlds/<name>/world.yaml`** — top-level world config:
```yaml
id: example-world
title: "The Forgotten Library"
version: "1.0.0"
start_map: entrance-hall
player:
  name: "The Archivist"
  sprite: assets/player.png
```

**`worlds/<name>/map/<id>.yaml`** — map definition:
```yaml
id: town
title: "Town"
background: assets/entrance.png
music: assets/ambient.ogg
exits:
  north: forest
  east: road
on_enter:
  - event: first-visit-entrance
```

**`worlds/<name>/location/<id>.yaml`** — location definition:
```yaml
id: entrance-hall
title: "Entrance Hall"
background: assets/entrance.png
music: assets/ambient.ogg
map: town
coordinates: [78, 24]
on_enter:
  - event: first-visit-entrance
```

**`worlds/<name>/characters/<id>.yaml`** — character definition:
```yaml
id: librarian
name: "Mira"
portrait: assets/mira-portrait.png
ai:
  persona: |
    You are Mira, the head librarian of the Forgotten Library. You are
    knowledgeable, slightly eccentric, and protective of the library's secrets.
    You speak in a formal but warm tone. You do not know you are in a game.
  knowledge: |
    You know the library has seven restricted sections. You have a key to
    section three hidden in your desk. You suspect the curator is hiding something.
dialogue:
  greeting: "Ah, a visitor. We don't get many of those."
```

**`worlds/<name>/events/<id>.yaml`** — event/trigger definition:
```yaml
id: first-visit-entrance
conditions:
  - flag: visited_entrance
    value: false
actions:
  - set_flag: { visited_entrance: true }
  - show_text: "The dust motes hang in the air like forgotten words..."
```

## Tech Stack

| Concern | Technology |
|---|---|
| Rendering | [PixiJS](https://pixijs.com/) v8 on HTML Canvas |
| Data format | YAML (parsed via `js-yaml`) |
| AI Chat | Anthropic Claude API (model configurable per world) |
| Build | Vite |
| Language | Vanilla JS (ES modules) |

## Key Conventions

### YAML First
- All game content lives in YAML under `worlds/`
- No hardcoded story content in JS source
- The engine reads and interprets YAML at runtime
- New worlds are added by creating a new folder under `worlds/` — no engine changes needed

### World Isolation
- Each world folder is fully self-contained
- Worlds should not reference assets or data from other worlds
- Shared engine utilities live in `src/`, never in `worlds/`

### AI Character Chat
- Each character has a `persona` and optional `knowledge` block in their YAML
- The engine injects persona + knowledge + conversation history into the Claude API call
- The world's `system_prompt_base` provides narrative framing for all characters
- Never expose raw API keys in world YAML — use environment variables

### PixiJS Rendering
- All rendering goes through the PixiJS app in `src/ui/canvas.js`
- Scenes own their sprites/containers; the engine mounts/unmounts on transition
- UI overlays (chat window, HUD) are separate PixiJS containers layered on top

### Naming
- YAML file names use `kebab-case` matching the `id` field inside them
- JS files use `camelCase`
- Character, scene, item, and event IDs are globally unique within a world

## Environment Variables

```
ANTHROPIC_API_KEY=     # Claude API key for AI character chat
VITE_DEFAULT_WORLD=    # World to load on startup (default: first in worlds/)
```

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Start Vite dev server
npm run build      # Production build
npm run preview    # Preview production build
```

## Dev Server (Windows Notes)

`node` and `npm` are not on the bash shell PATH on this machine. To start the dev server, use the `preview_start` MCP tool with the config in `.claude/launch.json`, which routes through `cmd.exe` to inject the correct PATH:

```json
{
  "runtimeExecutable": "cmd.exe",
  "runtimeArgs": ["/c", "set PATH=C:\\Program Files\\nodejs;%PATH% && npm run dev"],
  "port": 5173
}
```

- Node.js lives at `C:\Program Files\nodejs\`
- The server runs on **http://localhost:5173**
- Always use `preview_start` / `preview_stop` rather than running npm via Bash

## Testing 

do not try to look at screenshots when testing. rely on me to tell you if it worked or not 