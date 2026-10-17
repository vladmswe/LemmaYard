import { getCurrentUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { jsonError } from "@/server/http/request";
import { json, SIGN_IN_REQUIRED } from "@/server/rooms/http";
import { createRoom } from "@/server/rooms/membership";
import { listMyRooms } from "@/server/rooms/queries";

export const dynamic = "force-dynamic";

/** The viewer's rooms (Q1). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, SIGN_IN_REQUIRED);
  return json({ rooms: await listMyRooms(getDb(), user.id) });
}

/** `{name}` → 201 `{id}`; the creator becomes the owner. */
export function POST(request: Request) {
  return createRoom(request);
}
