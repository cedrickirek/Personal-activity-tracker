import { ImageResponse } from "next/og";
import { AppIcon } from "./app-icon";

// The icon iPhone uses for "Add to Home Screen" (180×180 is Apple's size).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<AppIcon size={size.width} />, size);
}
