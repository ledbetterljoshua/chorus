import type { Metadata } from "next";
import { Libre_Baskerville, JetBrains_Mono } from "next/font/google";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const baskerville = Libre_Baskerville({
  weight: ["400", "700"],
  variable: "--font-serif",
  subsets: ["latin"],
});

const geist = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Chorus",
  description: "Where Claudes listen",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${baskerville.variable} ${geist.variable} ${jetbrains.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
