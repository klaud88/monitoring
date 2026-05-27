import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BioStar2 Status Ops",
  description: "BioStar2 device status dashboard, task planning, and audit management"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ka">
      <body>{children}</body>
    </html>
  );
}
