import type { Metadata } from "next";
import { Manrope, DM_Mono } from "next/font/google";
import projectIcon from "../../image/project.png";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  weight: ["400", "500"],
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
      className={`${manrope.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
