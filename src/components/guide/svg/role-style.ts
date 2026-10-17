// Single source of the role grammar: colour token + the non-colour cue of each
// role (section 2.4). Colours are only var(--viz-*) references; the tokens
// themselves live in viz-theme.css.
import type { Role } from "@/lib/guide/contracts";

export type RoleCue = "marker" | "double" | "strike" | "check" | "bang" | "new";

export interface RoleStyle {
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly dash?: string; // stroke-dasharray
  readonly fill: string;
  readonly shapeOpacity?: number;
  readonly textFill: string;
  /** Extra elements drawn with the shape: never colour-only. */
  readonly cues: readonly RoleCue[];
  readonly label: string; // legend text
}

export const DEFAULT_STYLE: RoleStyle = {
  stroke: "var(--viz-node-border)",
  strokeWidth: 1.5,
  fill: "var(--viz-node-bg)",
  textFill: "var(--viz-node-fg)",
  cues: [],
  label: "Default",
};

export const ROLE_STYLES: Readonly<Record<Role, RoleStyle>> = {
  current: { ...DEFAULT_STYLE, stroke: "var(--viz-current)", strokeWidth: 3, cues: ["marker"], label: "Current" },
  compared: { ...DEFAULT_STYLE, stroke: "var(--viz-compared)", strokeWidth: 2, dash: "6 3", label: "Compared" },
  changed: {
    ...DEFAULT_STYLE,
    stroke: "var(--viz-changed)",
    strokeWidth: 2,
    fill: "var(--viz-changed-fill)",
    cues: ["double"],
    label: "Changed",
  },
  new: { ...DEFAULT_STYLE, stroke: "var(--viz-new)", strokeWidth: 2, dash: "2 3", cues: ["new"], label: "New" },
  removed: {
    ...DEFAULT_STYLE,
    stroke: "var(--viz-removed)",
    strokeWidth: 2,
    shapeOpacity: 0.4,
    cues: ["strike"],
    label: "Removed",
  },
  visited: {
    ...DEFAULT_STYLE,
    stroke: "var(--viz-visited)",
    strokeWidth: 2,
    fill: "var(--viz-visited-fill)",
    label: "Visited",
  },
  frontier: { ...DEFAULT_STYLE, stroke: "var(--viz-frontier)", strokeWidth: 2, dash: "8 3 2 3", label: "Waiting" },
  done: {
    ...DEFAULT_STYLE,
    stroke: "var(--viz-done)",
    strokeWidth: 2,
    fill: "var(--viz-done-fill)",
    cues: ["check"],
    label: "Done",
  },
  path: { ...DEFAULT_STYLE, stroke: "var(--viz-path)", strokeWidth: 3.5, label: "On the path" },
  muted: {
    ...DEFAULT_STYLE,
    stroke: "var(--viz-muted)",
    shapeOpacity: 0.5,
    textFill: "var(--viz-muted)",
    label: "Out of scope",
  },
  error: { ...DEFAULT_STYLE, stroke: "var(--viz-error)", strokeWidth: 2, cues: ["bang"], label: "Breaks the rule" },
};

export function roleStyle(role: Role | undefined | null): RoleStyle {
  return role ? ROLE_STYLES[role] : DEFAULT_STYLE;
}

/** Cues that are drawn only in key-step thumbnails (where the "new" badge replaces animation). */
export const THUMB_ONLY_CUES: ReadonlySet<RoleCue> = new Set(["new"]);
