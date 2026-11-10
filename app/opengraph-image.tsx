import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const alt = "APROVO: seu feed. Aprovado. Publicado.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function readOptional(file: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), file));
  } catch {
    return null;
  }
}

/** Root OG card (docs/14 area D): dark aurora, logo, tagline. No user data. */
export default async function OpengraphImage() {
  const [logo, font, fontRegular] = await Promise.all([
    readOptional("public/brand/aprovo-logo-dark.png"),
    // Satori needs woff/ttf; Poppins is the brand fallback face. Falls back to the default font.
    readOptional("node_modules/@fontsource/poppins/files/poppins-latin-800-normal.woff"),
    readOptional("node_modules/@fontsource/poppins/files/poppins-latin-500-normal.woff"),
  ]);
  const logoSrc = logo ? `data:image/png;base64,${logo.toString("base64")}` : null;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        backgroundColor: "#0B0816",
        backgroundImage:
          "radial-gradient(circle at 12% 8%, rgba(106,0,255,0.55) 0%, rgba(11,8,22,0) 45%), radial-gradient(circle at 92% 18%, rgba(155,60,255,0.45) 0%, rgba(11,8,22,0) 40%), radial-gradient(circle at 75% 105%, rgba(34,230,136,0.30) 0%, rgba(11,8,22,0) 40%)",
        color: "#F5F2FF",
        fontFamily: font ? "Poppins" : undefined,
      }}
    >
      {logoSrc ? (
        <img src={logoSrc} width={275} height={120} alt="" />
      ) : (
        <div style={{ fontSize: 64, fontWeight: 800 }}>aprovo</div>
      )}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 92,
            fontWeight: 800,
            lineHeight: 1.02,
            letterSpacing: "-0.03em",
          }}
        >
          <span>Seu feed.</span>
          <span
            style={{
              backgroundImage: "linear-gradient(90deg, #A77BFF 0%, #C78BFF 55%, #22E688 100%)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Aprovado.
          </span>
          <span>Publicado.</span>
        </div>
        <div style={{ marginTop: 28, fontSize: 30, fontWeight: 500, color: "#A9A2C4" }}>
          Monte o feed do cliente, mande um link e receba o sim.
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: 10,
          backgroundImage: "linear-gradient(90deg, #6A00FF 0%, #9B3CFF 55%, #22E688 100%)",
        }}
      />
    </div>,
    {
      ...size,
      fonts: font
        ? [
            { name: "Poppins", data: font, weight: 800, style: "normal" },
            ...(fontRegular
              ? [
                  {
                    name: "Poppins",
                    data: fontRegular,
                    weight: 500 as const,
                    style: "normal" as const,
                  },
                ]
              : []),
          ]
        : undefined,
    },
  );
}
