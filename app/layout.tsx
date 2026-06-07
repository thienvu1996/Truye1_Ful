import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TruyenFull Scraper",
  description: "Scrape TruyenFull stories through local API routes",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
