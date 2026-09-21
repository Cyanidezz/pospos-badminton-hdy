import MobileApp from "./mobile-app";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wingpro POS",
  description: "ขายหน้าร้าน จัดการสต๊อก และรับคืนไม้แบดมินตัน",
  manifest: "/manifest.webmanifest",
  appleWebApp: {capable: true, title: "Wingpro POS", statusBarStyle: "default"},
  formatDetection: {telephone: false},
  icons: {
    apple: "/wingpro-logo.jpeg",
    icon: "/wingpro-icon.svg",
    shortcut: "/wingpro-icon.svg",
  },
};

export const viewport: Viewport = {width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#3a70d4"};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="antialiased">{children}<MobileApp/></body>
    </html>
  );
}
