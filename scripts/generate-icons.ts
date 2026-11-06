import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(__dirname, "..");
const LOGO = path.join(ROOT, "public/brand/aprovo-logo.png");
const OUT = path.join(ROOT, "public/icons");
const PURPLE = "#6A00FF";

async function render(file: string, size: number, logoRatio: number) {
  const logoWidth = Math.round(size * logoRatio);
  const logo = await sharp(LOGO).resize({ width: logoWidth, fit: "inside" }).toBuffer();
  // The wordmark is dark purple, so it sits on a white plate over the purple background.
  const plateWidth = Math.round(logoWidth * 1.2);
  const plateHeight = Math.round(plateWidth * 0.72);
  const plate = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${plateWidth}" height="${plateHeight}">` +
      `<rect width="100%" height="100%" rx="${Math.round(plateHeight * 0.28)}" fill="#FFFFFF"/></svg>`,
  );
  await sharp({
    create: { width: size, height: size, channels: 4, background: PURPLE },
  })
    .composite([
      { input: plate, gravity: "center" },
      { input: logo, gravity: "center" },
    ])
    .png()
    .toFile(path.join(OUT, file));
  console.log(`icons: ${file} (${size}x${size})`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await render("icon-192.png", 192, 0.62);
  await render("icon-512.png", 512, 0.62);
  // maskable: the safe zone is the central 80% circle, so keep the logo narrower
  await render("maskable-512.png", 512, 0.5);
  await render("apple-touch-icon.png", 180, 0.62);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
