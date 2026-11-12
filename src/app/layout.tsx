import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";
export const metadata: Metadata = {
  title: "Daymark — Make room for what matters",
  description: "A calm workspace for tasks, classes, projects, and time.",
  icons: {
    icon: "/daymark-icon.svg",
    shortcut: "/daymark-icon.svg",
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
