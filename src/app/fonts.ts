import { JetBrains_Mono, Source_Sans_3, Source_Serif_4 } from "next/font/google";

// Self-hosted by next/font at build time: no runtime requests to Google.
export const fontSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
  display: "swap",
});

export const fontSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  axes: ["opsz"],
  display: "swap",
});

// Monaco needs `fontMono.style.fontFamily` (the hashed family name).
export const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});
