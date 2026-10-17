/** Avatar initials: the first two characters of the username, uppercased. */
export function initials(name: string): string {
  return Array.from(name.trim()).slice(0, 2).join("").toUpperCase() || "?";
}
