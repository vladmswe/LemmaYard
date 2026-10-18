// Difficulty of a LeetCode catalog problem estimated from its community
// contest rating (docs/specs/leetcode-integration.md §6.3, owner decision 2).
// The zerotrac dataset has no difficulty label, so the label shown in rooms is
// derived here, in ONE place: change the bands below to change it everywhere
// (draw, search, lobby, results). The overlay file can override it per problem.
//
// Bands (rating = Elo-style contest rating, same scale as room ratings):
//   rating < 1450          → easy
//   1450 ≤ rating < 1850   → medium
//   rating ≥ 1850          → hard
// They match the author-rating bands of our own problems (rooms-v2 §8).
import type { Difficulty } from "@/lib/rooms/types";

export const DIFFICULTY_BANDS = {
  /** Lowest rating labelled medium. */
  mediumFrom: 1450,
  /** Lowest rating labelled hard. */
  hardFrom: 1850,
} as const;

/** The estimated difficulty of a problem with this rating (see the bands above). */
export function difficultyFromRating(rating: number): Difficulty {
  if (rating < DIFFICULTY_BANDS.mediumFrom) return "easy";
  if (rating < DIFFICULTY_BANDS.hardFrom) return "medium";
  return "hard";
}
