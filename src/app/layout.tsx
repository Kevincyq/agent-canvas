import type { Metadata } from "next";
import type { ReactNode } from "react";

import "katex/dist/katex.min.css";

import "./globals.css";

export const metadata: Metadata = {
  title: "Canvas Agent MVP",
  description: "A Web UI agent with MCP integration and a handwriting canvas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
