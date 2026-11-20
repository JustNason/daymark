import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";
export const metadata: Metadata = {
  title: "Daymark — Make room for what matters",
  description: "A calm workspace for tasks, classes, projects, and time.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      {
        url: "/daymark-icon.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/daymark-icon-light.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: light)",
      },
    ],
    shortcut: "/daymark-icon.svg",
    apple: "/apple-touch-icon.png",
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
