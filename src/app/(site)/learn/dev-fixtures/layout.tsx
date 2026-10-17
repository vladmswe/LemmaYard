import "@/components/guide/viz-theme.css";

// Player fixtures for Playwright (M-G0). Pages 404 unless GUIDE_FIXTURES=1.
export default function DevFixturesLayout({ children }: LayoutProps<"/learn/dev-fixtures">) {
  return <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">{children}</div>;
}
