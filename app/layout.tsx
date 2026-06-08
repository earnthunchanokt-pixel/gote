import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gote POS",
  description: "Mobile-first beverage POS built with Next.js, TypeScript, and Tailwind CSS.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
