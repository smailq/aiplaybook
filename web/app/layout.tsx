import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Playbook",
  description: "Your living playbook, co-authored in the open.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
