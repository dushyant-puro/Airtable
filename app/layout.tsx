import type { Metadata } from "next";
import "./globals.css";

const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://airboard-gesture-canvas.vyomsingh12334.chatgpt.site";

export const metadata: Metadata = {
  metadataBase: new URL(productionUrl),
  title: "AirBoard LiveLab — Executable Classroom Canvas",
  description:
    "A gesture-powered executable classroom for code, computer architecture, systems, and interactive documents.",
  openGraph: {
    title: "AirBoard LiveLab — Executable Classroom Canvas",
    description: "Teach code, logic, systems, and documents with live objects and hand gestures.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "AirBoard gesture canvas" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AirBoard LiveLab — Executable Classroom Canvas",
    description: "Teach code, logic, systems, and documents with live objects and hand gestures.",
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
