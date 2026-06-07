import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "BioStar2 Status Ops",
  description: "BioStar2 device status dashboard, task planning, and audit management"
};

const themeScript = `
  try {
    const savedTheme = localStorage.getItem("biostar-theme");
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme =
      savedTheme === "dark" || (!savedTheme && systemDark) ? "dark" : "light";
  } catch {
    document.documentElement.dataset.theme = "light";
  }
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ka" suppressHydrationWarning>
      <body>
        <Script
          id="biostar-theme-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        {children}
      </body>
    </html>
  );
}
