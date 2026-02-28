# Generate Image

Generate one or more images using `scripts/generate-image.mjs`. The script supports two modes:

- **Text-to-image** (default) — Uses **Imagen 4.0** for best quality generation
- **Reference image mode** (`--ref`) — Uses **Gemini 3.1 Flash Image Preview** when one or more reference images are provided. Use this for variations of an existing character, editing scenes, or style-matching.

## Arguments

`$ARGUMENTS` contains the user's request describing what image(s) to generate. It may be:
- A direct prompt and output path (e.g., "a Roman courtyard, save to worlds/escapefromrome/maps/villa/courtyard/courtyard.png")
- A description of what's needed (e.g., "portraits for all characters in escapefromrome")
- A general request (e.g., "background images for all locations missing them")
- A variation request referencing an existing image (e.g., "Make Felix's portrait at night time")

## Step 1: Read world art guidelines

Before generating any image, determine which world the image belongs to from the output path (e.g., `worlds/escapefromrome/...` → read `worlds/escapefromrome/world.yaml`).

Read the world's `world.yaml` and look for the `art` block:

```yaml
art:
  style: "oil painting, classical realism, rich warm tones"
  palette: "warm earth tones, deep Roman reds and golds, amber lamplight"
  portrait: "head and shoulders, dramatic chiaroscuro lighting"
  background: "wide angle, atmospheric, painterly, lived-in"
  notes: "Consistent with 1st century Roman setting. No modern elements."
```

Build a `--style` string from the relevant fields:
- For **portraits**: combine `art.style`, `art.palette`, and `art.portrait`
- For **backgrounds/locations**: combine `art.style`, `art.palette`, and `art.background`
- For **items**: combine `art.style` and `art.palette`
- Always include `art.notes` if present

If no `art` block exists in the world, omit `--style` and rely on prompt details alone.

## Step 2: Generate images

### Text-to-image (no reference)

```bash
"C:/Program Files/nodejs/node.exe" D:/dev/atlas/scripts/generate-image.mjs "<prompt>" <output-path> --style "<style-string>" 2>&1
```

### With reference image(s)

```bash
"C:/Program Files/nodejs/node.exe" D:/dev/atlas/scripts/generate-image.mjs "<prompt>" <output-path> --ref <ref-image-1> [--ref <ref-image-2> ...] --style "<style-string>" 2>&1
```

### Flags

- **`--style <text>`** — Art style guidelines appended to the prompt. Build this from the world's `art` block (see Step 1).
- **`--ref <path>`** — Path to a reference image (relative to project root). Can be specified multiple times, up to 14 reference images.
- When `--ref` is provided, the script automatically switches to Gemini 3.1 Flash Image Preview.
- Use `--ref` for: character variations (different lighting, angle, expression), editing existing scenes, style-matching across images, combining elements from multiple images.

### Common options

- **`<prompt>`** — A descriptive image generation prompt (see Prompt Guidelines below). Do NOT include style info here — that goes in `--style`.
- **`<output-path>`** — Relative path from project root (e.g., `worlds/myworld/characters/bob/portrait.png`)
- The script reads `GEMINI_API_KEY` from `.env` automatically
- The script creates parent directories if they don't exist
- Output format is always PNG
- Timeout should be set to **120000ms** (images can take a while)

## Generating multiple images

When generating multiple images, run them **in parallel** using `run_in_background: true` on each Bash call. This is much faster than sequential generation. Run up to 5 at a time to avoid rate limits.

## Prompt guidelines

Write detailed, specific prompts. Include:

- **Subject**: What is depicted (person, place, object)
- **Style**: Art style (e.g., "oil painting style", "watercolor", "digital art", "pixel art")
- **Lighting**: Lighting conditions (e.g., "warm lamplight", "dim torchlight", "soft garden light")
- **Framing**: Camera/composition (e.g., "head and shoulders portrait", "wide angle interior", "close-up")
- **Details**: Specific visual details relevant to the world's setting and era

### Portrait prompts
For character portraits, include in the prompt:
- Physical description (age, features, hair, expression)
- Clothing appropriate to the world's era/setting

The `--style` flag handles art style, palette, and framing — don't duplicate those in the prompt.

Example:
```bash
"C:/Program Files/nodejs/node.exe" D:/dev/atlas/scripts/generate-image.mjs "Portrait of a retired Roman legionary in his early forties, scarred face, short cropped hair, stubbled jaw, wearing a plain brown tunic, soldier bearing, dim torchlight" worlds/escapefromrome/characters/decimus/portrait.png --style "oil painting, classical realism, rich warm tones. warm earth tones, deep Roman reds and golds, amber lamplight, dark umber shadows. head and shoulders, dramatic chiaroscuro lighting, painterly brushstrokes. Consistent with 1st century Roman setting. No modern elements." 2>&1
```

### Location/background prompts
For scene backgrounds, include in the prompt:
- Interior or exterior setting
- Key architectural or environmental features
- Atmospheric details (lighting, mood)

Example:
```bash
"C:/Program Files/nodejs/node.exe" D:/dev/atlas/scripts/generate-image.mjs "Interior of a grand Roman villa atrium, high painted ceilings with frescoes, rectangular impluvium pool in center, marble busts lining walls, oil lamps in bronze holders" worlds/escapefromrome/maps/villa/atrium/atrium.png --style "oil painting, classical realism, rich warm tones. warm earth tones, deep Roman reds and golds, amber lamplight, dark umber shadows. wide angle, atmospheric, painterly, lived-in and textured. Consistent with 1st century Roman setting. No modern elements." 2>&1
```

### Item prompts
For item images, include in the prompt:
- The item isolated on a simple/neutral background
- Specific material and condition details

Example:
```bash
"C:/Program Files/nodejs/node.exe" D:/dev/atlas/scripts/generate-image.mjs "A small clay oil lamp shaped like a leaf, worn and ancient, Roman era, on a dark neutral background" worlds/escapefromrome/items/oil-lamp.png --style "oil painting, classical realism, rich warm tones. warm earth tones, deep Roman reds and golds, amber lamplight, dark umber shadows. Consistent with 1st century Roman setting. No modern elements." 2>&1
```

## Reference image examples

### Character variation (different lighting)
```bash
"C:/Program Files/nodejs/node.exe" D:/dev/atlas/scripts/generate-image.mjs "Same person, nighttime, lit by flickering oil lamp, deep shadows, head and shoulders portrait" worlds/escapefromrome/characters/felix/portrait_night.png --ref worlds/escapefromrome/characters/felix/portrait.png 2>&1
```

### Character in a different pose or scene
```bash
"C:/Program Files/nodejs/node.exe" D:/dev/atlas/scripts/generate-image.mjs "This person sitting at a wooden table, writing on a wax tablet, oil painting style" worlds/escapefromrome/characters/felix/felix_writing.png --ref worlds/escapefromrome/characters/felix/portrait.png 2>&1
```

### Style-matching across characters
Use another character's portrait as a style reference alongside the description of the new character:
```bash
"C:/Program Files/nodejs/node.exe" D:/dev/atlas/scripts/generate-image.mjs "Portrait of an old Roman merchant, bald, hooked nose, wearing a toga, head and shoulders portrait, match the art style of the reference image" worlds/escapefromrome/characters/merchant/portrait.png --ref worlds/escapefromrome/characters/marcus/portrait.png 2>&1
```

### Editing a scene
```bash
"C:/Program Files/nodejs/node.exe" D:/dev/atlas/scripts/generate-image.mjs "Same scene but at night, moonlight through the columns, oil lamps lit, darker atmosphere" worlds/escapefromrome/maps/villa/courtyard/courtyard_night.png --ref worlds/escapefromrome/maps/villa/courtyard/courtyard.png 2>&1
```

## After generating

- Update the relevant YAML files to reference the new image (e.g., add `portrait: portrait.png` to a character, or `background: background.png` to a location)
- Keep art style consistent within a world — check existing images in the world first to match the style

## Error handling

- If the script exits with an error about quota/rate limits, wait a moment and retry (up to 2 retries)
- If the prompt is blocked (no image generated), rephrase the prompt to be less specific about people or sensitive content
- If the model is not found, check that `GEMINI_API_KEY` is set in `.env` and billing is enabled on the Google AI Studio account
