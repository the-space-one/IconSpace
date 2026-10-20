import type { Metadata } from "next";
import localFont from "next/font/local";
import { OverlayScrollbar } from "@/components/overlay-scrollbar";
import "./globals.css";

const froundy = localFont({
  src: "../fonts/Froundy-Regular.woff2",
  variable: "--font-froundy-local",
});

const makenfy = localFont({
  src: "../fonts/Makenfy-Regular.woff2",
  variable: "--font-makenfy-local",
});

const title = "IconSpace — Premium animated icons";
const description =
  "Premium animated icons with fast, energetic motion that brings character and adds even more delight to every interaction.";

// The share image is app/opengraph-image.jpg (1200×630), which Next also
// uses for X's large card; metadataBase makes its URL absolute.
export const metadata: Metadata = {
  metadataBase: new URL("https://iconspace.dev"),
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "IconSpace",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${froundy.variable} ${makenfy.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
        <OverlayScrollbar />
      </body>
    </html>
  );
}
