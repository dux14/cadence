import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import sharp from "sharp";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const svg = readFileSync(here("./icon.svg"));

const targets = [
  [192, "icon-192.png"],
  [512, "icon-512.png"],
  [180, "apple-touch-icon.png"],
  [32, "favicon-32.png"],
];

await Promise.all(
  targets.map(([size, name]) =>
    sharp(svg)
      .resize(size, size)
      .png()
      .toFile(here(`../public/icons/${name}`)),
  ),
);

console.log("Generated", targets.map((t) => t[1]).join(", "));
