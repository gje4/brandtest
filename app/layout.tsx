import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import AppHeader from "@/app/components/app-header"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shopify Data Generator",
  description: "Generate AI-powered product data and integrate GitHub repositories",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-zinc-50 antialiased dark:bg-black`}>
        <AppHeader />
        <main>{children}</main>
      </body>
    </html>
  )
}
