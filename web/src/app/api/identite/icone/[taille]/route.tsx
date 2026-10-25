import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taille: string }> },
) {
  const { taille } = await params;
  if (taille !== "192" && taille !== "512" && taille !== "512-maskable") {
    return new Response("Icône inconnue", { status: 404 });
  }

  const px = taille === "192" ? 192 : 512;
  const contenu = Math.round(px * (taille === "512-maskable" ? 0.73 : 0.89));
  const url = new URL("/logo-officiel.png", request.url).toString();

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#ffffff",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Même blason que dans la navigation et les PDF ; marge pour le masque des lanceurs. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        width={contenu}
        height={contenu}
        alt=""
        style={{ objectFit: "contain" }}
      />
    </div>,
    {
      width: px,
      height: px,
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    },
  );
}
