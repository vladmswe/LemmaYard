// Plain-words result of POST /api/me/rating (Rooms v2 §6.4, §11): how many
// rooms took the new starting rating (`reseeded`: no rated sessions yet)
// and how many kept theirs (`kept`: the rating already comes from
// sessions). Pure.

function rooms(n: number): string {
  return `${n} room${n === 1 ? "" : "s"}`;
}

export function selfRatingResultCopy(leetcodeRating: number | null, reseeded: number, kept: number): string {
  const first =
    leetcodeRating === null
      ? "Removed. New rooms start you from your practice or at 1500."
      : `Saved: ${leetcodeRating}.`;
  const parts = [first];
  if (reseeded > 0) {
    parts.push(
      leetcodeRating === null
        ? `Your starting rating was reset in ${rooms(reseeded)} where you have no rated sessions yet.`
        : `It is now your starting rating in ${rooms(reseeded)} where you have no rated sessions yet.`,
    );
  }
  if (kept > 0) {
    parts.push(`${rooms(kept).replace(/^./, (c) => c.toUpperCase())} kept your rating, because it already comes from sessions there.`);
  }
  if (reseeded === 0 && kept === 0 && leetcodeRating !== null) {
    parts.push("It will be your starting point in the next room you play in.");
  }
  return parts.join(" ");
}
