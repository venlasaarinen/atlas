#!/usr/bin/env node
// Usage:
//   node scripts/generate-image.mjs "prompt" output/path.png
//   node scripts/generate-image.mjs "prompt" output/path.png --ref image1.png [--ref image2.png ...]
//   node scripts/generate-image.mjs "prompt" output/path.png --style "oil painting, warm tones"
//
// Without --ref: Uses Imagen 4.0 (best quality text-to-image)
// With --ref:    Uses Gemini 3.1 Flash Image Preview (supports up to 14 reference images)
// --style:       Appended to the prompt as style guidelines (from world.yaml art block)
//
// Reads GEMINI_API_KEY from .env in the project root.

import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Simple .env loader (avoids dotenv dependency)
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([\w]+)\s*=\s*(.+)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Error: GEMINI_API_KEY not found in environment or .env");
  process.exit(1);
}

// Parse arguments: <prompt> <output> [--ref <image>]... [--style <text>]
const args = process.argv.slice(2);
const refImages = [];
const positional = [];
let styleOverride = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--ref" && i + 1 < args.length) {
    refImages.push(args[++i]);
  } else if (args[i] === "--style" && i + 1 < args.length) {
    styleOverride = args[++i];
  } else {
    positional.push(args[i]);
  }
}

const [basePrompt, outputPath] = positional;
if (!basePrompt || !outputPath) {
  console.error("Usage: node scripts/generate-image.mjs <prompt> <output-path> [--ref <image> ...] [--style <text>]");
  process.exit(1);
}

// Append style guidelines to the prompt if provided
const prompt = styleOverride ? `${basePrompt}. Style: ${styleOverride}` : basePrompt;

const ai = new GoogleGenAI({ apiKey });
const resolvedPath = path.resolve(root, outputPath);

console.log(`Generating: "${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}"`);
if (styleOverride) {
  console.log(`Style: "${styleOverride.slice(0, 60)}${styleOverride.length > 60 ? "..." : ""}"`);
}
if (refImages.length) {
  console.log(`Reference images: ${refImages.join(", ")}`);
}

let imageBytes;

if (refImages.length === 0) {
  // --- Imagen 4.0: text-to-image (best quality) ---
  const response = await ai.models.generateImages({
    model: "imagen-4.0-generate-001",
    prompt,
    config: { numberOfImages: 1 },
  });

  if (!response.generatedImages?.length) {
    console.error("Error: No image was generated. The prompt may have been blocked.");
    process.exit(1);
  }

  imageBytes = response.generatedImages[0].image.imageBytes;
} else {
  // --- Gemini 3.1 Flash: text + reference image(s) ---
  const mimeTypes = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

  const contents = [{ text: prompt }];

  for (const refPath of refImages) {
    const resolved = path.resolve(root, refPath);
    if (!fs.existsSync(resolved)) {
      console.error(`Error: Reference image not found: ${resolved}`);
      process.exit(1);
    }
    const ext = path.extname(resolved).toLowerCase();
    const mimeType = mimeTypes[ext] || "image/png";
    const data = fs.readFileSync(resolved).toString("base64");
    contents.push({ inlineData: { mimeType, data } });
  }

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents,
    config: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  });

  const imagePart = response.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData?.mimeType?.startsWith("image/")
  );

  if (!imagePart) {
    console.error("Error: No image was generated. The prompt may have been blocked.");
    const textPart = response.candidates?.[0]?.content?.parts?.find((p) => p.text);
    if (textPart) console.error("Response:", textPart.text);
    process.exit(1);
  }

  imageBytes = imagePart.inlineData.data;
}

// Ensure output directory exists and save
fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
fs.writeFileSync(resolvedPath, Buffer.from(imageBytes, "base64"));

console.log(`Saved to ${resolvedPath}`);
