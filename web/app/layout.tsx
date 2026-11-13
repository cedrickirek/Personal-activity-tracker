import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Activity tracker",
  description: "My personal activity log.",
  // A private tool: ask search engines not to list it.
  robots: { index: false, follow: false },
  // The name under the icon on the iPhone home screen. The icon itself comes
  // from app/apple-icon.tsx, and full-screen launch from app/manifest.ts.
  appleWebApp: { title: "Tracker", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
