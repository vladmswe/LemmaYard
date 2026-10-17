import { joinRoom } from "@/server/rooms/membership";

export const dynamic = "force-dynamic";

/** `{token}` in the body (never in the URL) → 200 `{roomId}`. */
export function POST(request: Request) {
  return joinRoom(request);
}
