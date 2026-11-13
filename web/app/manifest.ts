import type { MetadataRoute } from "next";

// The web app manifest: tells the phone how to install the site on the home
// screen. "standalone" opens it full screen, without Safari's address bar.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Activity tracker",
    short_name: "Tracker",
    description: "My personal activity log.",
    start_url: "/",
    display: "standalone",
    background_color: "#18181b",
    theme_color: "#18181b",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
