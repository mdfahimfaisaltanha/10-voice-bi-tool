import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Voice BI — Ask your data",
  description:
    "Voice-driven business intelligence: ask questions in plain language, get SQL-backed answers with automatic chart selection.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
