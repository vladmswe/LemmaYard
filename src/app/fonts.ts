import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";

// Self-hosted by next/font at build time: no runtime requests to Google.
// DESIGN.md §7: Instrument Serif = display only (>= 28px, one weight, so
// `font-synthesis-weight: none` in globals.css), Instrument Sans = UI and
// body text, JetBrains Mono = code, labels and gutter numbers.
export const fontSans = Instrument_Sans({
  subsets: ["latin"],
  // wdth only for the wordmark (font-stretch: 92%).
  axes: ["wdth"],
  variable: "--font-instrument-sans",
  display: "swap",
});

export const fontDisplay = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
});

// Monaco needs `fontMono.style.fontFamily` (the hashed family name).
export const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});
