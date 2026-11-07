import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * PWA icons, apple-touch-icon and favicon from the vector mark (docs/14, area D).
 * The mark is the logo's green check + the three "sparkle" dashes, on the brand gradient
 * (#6A00FF -> #9B3CFF), without the old white plate. Sources live in assets/brand/*.svg;
 * the SVGs are also copied to public/brand/ so the app and e-mails can use them.
 */

const ROOT = path.resolve(__dirname, "..");
const BRAND = path.join(ROOT, "assets/brand");
const OUT = path.join(ROOT, "public/icons");
const PUBLIC_BRAND = path.join(ROOT, "public/brand");

/** Check + dashes in the logo's own coordinates (assets/brand/aprovo-logo.svg, 794x346). */
const GLYPH = `
  <g fill="none" stroke="#FFFFFF" stroke-width="19" stroke-linecap="round">
    <path d="M653 33L667 67"/><path d="M687 84L718 56"/><path d="M703 111L739 101"/>
  </g>
  <path d="M513 168L561 236L641 116" fill="none" stroke="url(#check)" stroke-width="44"
    stroke-linecap="round" stroke-linejoin="round"/>`;
/** Centre of the glyph's bounding box (x 491-749, y 23-258). */
const GLYPH_CX = 620;
const GLYPH_CY = 140.5;

/**
 * @param radius corner radius on a 512 canvas (0 = full bleed, for maskable / iOS)
 * @param scale glyph scale on a 512 canvas (1.3 fills ~65%; maskable stays inside the 80% circle)
 */
function markSvg(radius: number, scale: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">` +
    `<defs>` +
    `<linearGradient id="bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="#6A00FF"/><stop offset="0.5" stop-color="#8418FF"/>` +
    `<stop offset="1" stop-color="#9B3CFF"/></linearGradient>` +
    `<linearGradient id="check" x1="491" y1="258" x2="663" y2="94" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="#6CF51C"/><stop offset="1" stop-color="#19F000"/></linearGradient>` +
    `</defs>` +
    `<rect width="512" height="512" rx="${radius}" fill="url(#bg)"/>` +
    `<g transform="translate(256 262) scale(${scale}) translate(${-GLYPH_CX} ${-GLYPH_CY})">${GLYPH}</g>` +
    `</svg>`
  );
}

async function render(file: string, size: number, svg: string) {
  await sharp(Buffer.from(svg), { density: Math.max(72, Math.ceil((72 * size) / 512) * 2) })
    .resize(size, size)
    .png()
    .toFile(path.join(OUT, file));
  console.log(`icons: ${file} (${size}x${size})`);
}

/** ICO with PNG payloads (supported by every current browser). */
async function writeIco(file: string, sizes: number[], svg: string) {
  const images = await Promise.all(
    sizes.map((size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()),
  );
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries: Buffer[] = [];
  let offset = 6 + 16 * images.length;
  images.forEach((png, i) => {
    const size = sizes[i] ?? 0;
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  });
  await writeFile(file, Buffer.concat([header, ...entries, ...images]));
  console.log(`icons: ${path.relative(ROOT, file)} (${sizes.join(", ")})`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(PUBLIC_BRAND, { recursive: true });

  const rounded = markSvg(116, 1.3);
  const fullBleed = markSvg(0, 1.3);
  // maskable: the OS may crop to the central 80% circle; keep the glyph well inside it
  const maskable = markSvg(0, 1.0);

  await render("icon-192.png", 192, rounded);
  await render("icon-512.png", 512, rounded);
  await render("maskable-512.png", 512, maskable);
  await render("maskable-192.png", 192, maskable);
  // iOS applies its own rounded mask and fills transparency with black: full bleed
  await render("apple-touch-icon.png", 180, fullBleed);
  await writeFile(path.join(OUT, "icon.svg"), rounded);
  await writeIco(path.join(ROOT, "app/favicon.ico"), [16, 32, 48], rounded);

  for (const name of ["aprovo-logo.svg", "aprovo-logo-dark.svg", "aprovo-mark.svg"]) {
    await copyFile(path.join(BRAND, name), path.join(PUBLIC_BRAND, name));
    console.log(`brand: public/brand/${name}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
