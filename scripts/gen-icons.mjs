import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

const master = readFileSync(here("./icon.svg"));
const flat = readFileSync(here("./icon-flat.svg"));
const maskable = readFileSync(here("./icon-maskable.svg"));

// [source, size, output] — master for app icons, flat for favicon, maskable for Android.
const targets = [
  [master, 192, "icon-192.png"],
  [master, 512, "icon-512.png"],
  [master, 180, "apple-touch-icon.png"],
  [maskable, 512, "icon-512-maskable.png"],
  [flat, 32, "favicon-32.png"],
];

await Promise.all(
  targets.map(([svg, size, name]) =>
    sharp(svg)
      .resize(size, size)
      .png()
      .toFile(here(`../public/icons/${name}`)),
  ),
);

// favicon.ico: a single-entry ICO wrapping a 32px PNG (PNG-in-ICO, supported by all modern browsers).
const png32 = await sharp(flat).resize(32, 32).png().toBuffer();
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // image count
const entry = Buffer.alloc(16);
entry.writeUInt8(32, 0); // width
entry.writeUInt8(32, 1); // height
entry.writeUInt16LE(1, 4); // color planes
entry.writeUInt16LE(32, 6); // bits per pixel
entry.writeUInt32LE(png32.length, 8); // image data size
entry.writeUInt32LE(22, 12); // image data offset (6 + 16)
writeFileSync(here("../app/favicon.ico"), Buffer.concat([header, entry, png32]));

console.log(
  "Generated",
  targets.map((t) => t[2]).join(", "),
  "+ favicon.ico",
);
