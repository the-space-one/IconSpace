import type { Metadata } from "next";
import localFont from "next/font/local";
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

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "IconSpace",
    type: "website",
  },
  twitter: {
    card: "summary",
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
