import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 112,
          background: "linear-gradient(135deg, #1e40af 0%, #0ea5e9 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontWeight: 800,
          letterSpacing: "-0.05em",
          borderRadius: 40,
        }}
      >
        A
      </div>
    ),
    { ...size },
  );
}
