import type { Metadata } from "next";
import "./globals.css";

const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://airboard-gesture-canvas.vyomsingh12334.chatgpt.site";

export const metadata: Metadata = {
  metadataBase: new URL(productionUrl),
  title: "AirBoard — Spatial Document OS",
  description:
    "A gesture-powered spatial workspace for reading, marking, navigating, and researching documents.",
  openGraph: {
    title: "AirBoard — Spatial Document OS",
    description: "Read, mark, navigate, zoom, and research documents with your hands.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "AirBoard gesture canvas" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AirBoard — Spatial Document OS",
    description: "Read, mark, navigate, zoom, and research documents with your hands.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
