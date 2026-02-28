# Generate Image

Generate one or more images using the Imagen 4.0 API via `scripts/generate-image.mjs`.

## Arguments

`$ARGUMENTS` contains the user's request describing what image(s) to generate. It may be:
- A direct prompt and output path (e.g., "a Roman courtyard, save to worlds/escapefromrome/maps/villa/courtyard/courtyard.png")
- A description of what's needed (e.g., "portraits for all characters in escapefromrome")
- A general request (e.g., "background images for all locations missing them")

## How to generate images

Run the script via Bash:

```bash
"C:/Program Files/nodejs/node.exe" D:/dev/atlas/scripts/generate-image.mjs "<prompt>" <output-path> 2>&1
```

- **`<prompt>`** — A descriptive image generation prompt (see Prompt Guidelines below)
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
For character portraits, always include:
- Physical description (age, features, hair, expression)
- Clothing appropriate to the world's era/setting
- Art style consistent with other images in the world
- "head and shoulders portrait" for consistent framing

Example:
```
"Portrait of a retired Roman legionary in his early forties, scarred face, short cropped hair, stubbled jaw, wearing a plain brown tunic, soldier bearing, oil painting style, dim torchlight, head and shoulders portrait"
```

### Location/background prompts
For scene backgrounds, always include:
- Interior or exterior setting
- Key architectural or environmental features
- Atmospheric details (lighting, mood)
- "wide angle" for consistent framing

Example:
```
"Interior of a grand Roman villa atrium, high painted ceilings with frescoes, rectangular impluvium pool in center, marble busts lining walls, oil lamps in bronze holders, atmospheric oil painting style, wide angle"
```

### Item prompts
For item images, use:
- The item isolated on a simple/neutral background
- Specific material and condition details
- Consistent art style with the world

Example:
```
"A small clay oil lamp shaped like a leaf, worn and ancient, Roman era, on a dark neutral background, oil painting style"
```

## After generating

- Update the relevant YAML files to reference the new image (e.g., add `portrait: portrait.png` to a character, or `background: background.png` to a location)
- Keep art style consistent within a world — check existing images in the world first to match the style

## Error handling

- If the script exits with an error about quota/rate limits, wait a moment and retry (up to 2 retries)
- If the prompt is blocked (no image generated), rephrase the prompt to be less specific about people or sensitive content
- If the model is not found, check that `GEMINI_API_KEY` is set in `.env` and billing is enabled on the Google AI Studio account
