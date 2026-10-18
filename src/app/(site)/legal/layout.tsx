import "./legal.css";

/** Legal pages (community C1): drafts for the owner; 404 while COMMUNITY_ENABLED is off (each page checks). */
export default function LegalLayout({ children }: LayoutProps<"/legal">) {
  return <>{children}</>;
}
