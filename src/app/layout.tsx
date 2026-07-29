import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

const applicationName =
  "Primary School Academic Results and Report Management System";

export const metadata: Metadata = {
  applicationName,
  title: {
    default: applicationName,
    template: `%s | ${applicationName}`,
  },
  description:
    "A secure foundation for managing primary-school academic results, reports, and authorised report access.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f5f7f6",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
