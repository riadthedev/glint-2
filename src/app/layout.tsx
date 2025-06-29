import type { Metadata } from "next";
import { SVGProvider } from "./context/svgcontext";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Glint",
  description: "Create 3D spinning videos from SVGs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* async external loader */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=G-XSN9QDJG7J`}
          strategy="afterInteractive"
        />
        {/* inline config */}
        <Script id="ga-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-XSN9QDJG7J', {
              page_path: window.location.pathname,
            });
          `}
        </Script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SVGProvider>
          {children}
        </SVGProvider>
      </body>
    </html>
  );
}
