import type { Role } from "@/lib/guide/contracts";

import { RoleShape } from "./RoleShape";
import { ROLE_STYLES } from "./role-style";

/** Role key: swatch with the role's outline and cue, plus its name. */
export function Legend({ roles, className }: { roles: readonly Role[]; className?: string }) {
  return (
    <ul className={`viz flex flex-wrap gap-x-4 gap-y-2 text-sm${className ? ` ${className}` : ""}`} data-legend="">
      {roles.map((role) => (
        <li key={role} className="flex items-center gap-2" data-legend-role={role}>
          <svg className="viz-swatch" width={48} height={46} viewBox="-8 -16 48 46" aria-hidden="true">
            <RoleShape shape={{ kind: "rect", w: 28, h: 20, rx: 4 }} role={role} thumb />
          </svg>
          <span>{ROLE_STYLES[role].label}</span>
        </li>
      ))}
    </ul>
  );
}
