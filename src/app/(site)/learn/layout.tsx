import "@/components/guide/viz-theme.css";
import "@/components/guide/guide.css";

// Data Structures guide (/learn): guide styles for every page below.
export default function LearnLayout({ children }: LayoutProps<"/learn">) {
  return <div className="guide-root flex flex-1 flex-col">{children}</div>;
}
