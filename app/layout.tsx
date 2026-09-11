import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guichê • Atendimento",
  description: "Recepção, filas e chamadas da unidade de atendimento.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
