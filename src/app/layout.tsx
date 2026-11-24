import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CineVault | Your DVD library",
  description: "A personal DVD catalog with verified film titles and award winners.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
