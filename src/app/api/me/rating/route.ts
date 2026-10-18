import { getMyRating, updateMyRating } from "@/server/rooms/self-rating";

export const dynamic = "force-dynamic";

/** Self: `{leetcodeRating, rooms: [{roomId, roomName, rating, ratedPairs, ratedSessions, provisional, source}]}`. */
export async function GET() {
  return getMyRating();
}

/** Self: `{leetcodeRating: number | null}` → 200 (same shape + `reseeded`, `kept`). */
export async function POST(request: Request) {
  return updateMyRating(request);
}
