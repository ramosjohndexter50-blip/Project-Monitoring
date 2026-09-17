import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import projectIcon from "../../image/project.png";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hamdan Studio Manila — Project Monitor",
  description: "Multi-discipline project tracking dashboard",
  icons: {
    icon: projectIcon.src,
    shortcut: projectIcon.src,
    apple: projectIcon.src,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
