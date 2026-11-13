import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Activity tracker",
  description: "My personal activity log.",
  // A private tool: ask search engines not to list it.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
