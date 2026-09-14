import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import localFont from "next/font/local";
import { Agentation } from "agentation";
import { Toaster } from "@/components/ui/sonner";
import { SmoothScroll } from "@/components/smooth-scroll";
import "lenis/dist/lenis.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const makenfy = localFont({
  src: "./fonts/makenfy-regular.woff2",
  variable: "--font-makenfy",
  weight: "400",
  style: "normal",
  display: "swap",
});

const froundy = localFont({
  src: "./fonts/froundy-regular.woff2",
  variable: "--font-froundy",
  weight: "400",
  style: "normal",
  display: "swap",
});

export const metadata: Metadata = {
  // The tab reads as the brand; the description is what carries the pitch into
  // search results and link previews.
  title: "Icon Space",
  description:
    "Beautifully animated icons. Fast, energetic, delightful motion. Join the waitlist.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} ${makenfy.variable} ${froundy.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SmoothScroll>{children}</SmoothScroll>
        <Toaster />
        {process.env.NODE_ENV === "development" && <Agentation />}
      </body>
    </html>
  );
}
