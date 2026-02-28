# Build World

You are building out a world for the Atlas story game engine. The world name is: **$ARGUMENTS**

The world directory is at `worlds/$ARGUMENTS/`. Your job is to scan the world, find anything incomplete or missing, and fill it in with rich, contextual, creative content that fits the world's theme and tone.

## Step 1: Read the world config

Read `worlds/$ARGUMENTS/world.yaml` to understand the world's theme, setting, tone, and player character. This is your creative north star — everything you generate must be consistent with it.

## Step 2: Audit the world

Scan the entire `worlds/$ARGUMENTS/` directory tree. For each content type below, identify what exists and what's missing.

### Characters (`worlds/$ARGUMENTS/characters/`)

Characters can be defined two ways:
- A standalone YAML file directly in `characters/` (e.g., `characters/librarian.yaml`)
- A subdirectory containing a YAML file and assets (e.g., `characters/mildred/mildred.yaml` + `characters/mildred/mildred.png`)

**Find gaps:**
- Subdirectories that have image files (`.png`, `.jpg`, `.webp`) but NO `.yaml` file — create the YAML
- YAML files missing key fields (`id`, `name`, `portrait`, `ai.persona`, `ai.knowledge`, `dialogue.greeting`)
- Characters whose `location` references a location that doesn't exist
- Characters with no `ai.environment` block (should describe their surroundings)

**When creating/completing character YAML, use this structure:**
```yaml
id: kebab-case-id
name: "Display Name"
portrait: portrait-filename.png  # if an image exists in the same directory
location: location-id  # where this character is found

ai:
  persona: |
    2-4 sentences describing personality, mannerisms, speech patterns, and role in the world.
    Write in second person ("You are..."). Make them feel like a real person, not a trope.

  knowledge: |
    5-10 lines of specific things this character knows.
    Include relationships to other characters in the world.
    Include secrets, suspicions, and things they avoid talking about.
    Each piece of knowledge should be a short, punchy line.

  environment: |
    Description of the physical spaces this character inhabits.
    Name specific locations from the world's maps.
    Include sensory details — sounds, smells, lighting.

inventory:
  - item: item-id
    quantity: 1

dialogue:
  greeting: |
    "A short in-character greeting line."
    Optional action beat or pause.
```

### Maps (`worlds/$ARGUMENTS/maps/`)

Each map is a subdirectory containing a YAML file and optional background images.

**Find gaps:**
- Map subdirectories with images but no YAML file
- Map YAML files missing `id`, `title`, `background`, or `locations` list
- Maps whose `locations` list references locations that don't have YAML files yet

**When creating/completing map YAML:**
```yaml
id: kebab-case-id
title: "Display Name"
background: background-filename.png  # if an image exists
soundtrack: assets/ambient.ogg

locations:
  - location-id-1
  - location-id-2

on_enter:
  - event: event-id
```

### Locations (`worlds/$ARGUMENTS/maps/*/`)

Locations are subdirectories within a map directory. Each contains a YAML file and optional assets.

**Find gaps:**
- Location subdirectories with images but no YAML file
- Location YAML files missing `id`, `title`, `map`, or `coordinates`
- Locations referenced in map YAML that don't have a directory or YAML file yet — create them
- Locations with background images but the YAML doesn't reference them

**When creating/completing location YAML:**
```yaml
id: kebab-case-id
title: "Display Name"
map: parent-map-id
coordinates: [X, Y]  # percentage-based 0-100, place sensibly on the map
background: background-filename.png  # if an image exists
```

If a location should have character positions (e.g., it's a tavern, shop, or gathering place), add:
```yaml
character_positions:
  - pos: [X, Y]
  - pos: [X, Y]
    keywords: ["keyword"]
```

If a location should have a task (e.g., fishing spot, bed, workbench), check if a task YAML exists in a subdirectory — if not, consider creating one.

### Items (`worlds/$ARGUMENTS/items/`)

**Find gaps:**
- Image files in `items/` with no corresponding YAML
- Items referenced in character inventories, player `start_inventory`, or task rewards that have no YAML definition
- Item YAML files missing `id`, `name`, `description`, or `value`

**When creating item YAML:**
```yaml
id: kebab-case-id
name: "Display Name"
description: "One flavorful sentence. Specific, tactile, grounded in the world."
value: 5  # relative value, 1-100 scale
image: filename.png  # if an image exists
```

### Events (`worlds/$ARGUMENTS/events/`)

**Find gaps:**
- Events referenced in map/location `on_enter` blocks that have no YAML file
- Event YAML files missing `id`, `conditions`, or `actions`

**When creating event YAML:**
```yaml
id: kebab-case-id
conditions:
  - flag: flag_name
    value: false
actions:
  - set_flag: { flag_name: true }
  - show_text: >
      2-3 sentences of atmospheric, in-world narration.
      Grounded and specific, not purple prose.
```

### Dialogue Rules (`worlds/$ARGUMENTS/dialogue.yaml`)

Check if `dialogue.yaml` exists. If not, create one with style, realism, and precedence rules appropriate for the world's tone and era.

### Tasks

Tasks live inside location subdirectories (e.g., `maps/village/fishingbend/Fishing/fishing.yaml`). Check for location directories that have task subdirectories with images but no YAML.

## Step 3: Build a plan

After the audit, create a TODO list of everything that needs to be created or completed. Group by content type. Present the plan to the user and ask for approval before writing any files.

## Step 4: Execute

After approval, create/update all the files. For each file:
- Be creative but consistent with the world's theme, era, and tone
- Cross-reference other content in the world (characters should know about locations, events should reference real flags, etc.)
- Use the exact YAML patterns shown above — the engine expects these structures
- Make characters feel like real people with specific, concrete details — not generic fantasy NPCs
- Item descriptions should be tactile and brief
- Event narration should be atmospheric but grounded

## Step 5: Summary

After all files are written, provide a summary of:
- Files created (with brief description)
- Files updated (what was added)
- Any remaining gaps that need human input (e.g., missing artwork, coordinates that need visual placement)
- Suggestions for additional content that would enrich the world
