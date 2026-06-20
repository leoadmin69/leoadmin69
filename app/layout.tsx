import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bizerte Beach Tennis",
  description: "Premier événement de Beach Tennis en Tunisie - Bizerte",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#111827" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
