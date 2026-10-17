import { previewInvite } from "@/server/rooms/membership";

export const dynamic = "force-dynamic";

/** `{token}` → 200 `{name, memberCount, memberNames, shareSolutions, alreadyMember}`. */
export function POST(request: Request) {
  return previewInvite(request);
}
