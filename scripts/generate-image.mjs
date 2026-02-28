#!/usr/bin/env node
// Usage: node scripts/generate-image.mjs "prompt text" output/path.png
//
// Generates an image using Gemini 2.0 Flash and saves it to disk.
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

const [prompt, outputPath] = process.argv.slice(2);
if (!prompt || !outputPath) {
  console.error("Usage: node scripts/generate-image.mjs <prompt> <output-path>");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

console.log(`Generating: "${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}"`);

const response = await ai.models.generateImages({
  model: "imagen-4.0-generate-001",
  prompt,
  config: { numberOfImages: 1 },
});

if (!response.generatedImages?.length) {
  console.error("Error: No image was generated. The prompt may have been blocked.");
  process.exit(1);
}

const imageBytes = response.generatedImages[0].image.imageBytes;
const resolvedPath = path.resolve(root, outputPath);

// Ensure output directory exists
fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
fs.writeFileSync(resolvedPath, Buffer.from(imageBytes, "base64"));

console.log(`Saved to ${resolvedPath}`);
