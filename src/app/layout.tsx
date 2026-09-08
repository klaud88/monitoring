import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "BioStar2 Status Ops",
  description: "BioStar2 device status dashboard, task planning, and audit management"
};

const bootScript = `
  try {
    const savedTheme = localStorage.getItem("biostar-theme");
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme =
      savedTheme === "dark" || (!savedTheme && systemDark) ? "dark" : "light";
  } catch {
    document.documentElement.dataset.theme = "light";
  }
  try {
    document.documentElement.dataset.sidebar =
      localStorage.getItem("bagebi-sidebar") === "collapsed" ? "collapsed" : "expanded";
  } catch {
    document.documentElement.dataset.sidebar = "expanded";
  }
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ka" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* App Router loads this on every page; the pages-router rule does not apply. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Georgian:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <Script
          id="biostar-theme-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: bootScript }}
        />
        {children}
      </body>
    </html>
  );
}
