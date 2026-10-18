// Request body of the self-reported rating (Rooms v2 §6.4, §11 `POST
// /api/me/rating`). Pure module: the profile form reuses it.
import { z } from "zod";

export const SELF_REPORTED_MIN = 0;
export const SELF_REPORTED_MAX = 4000;
/** Profile writes per user per hour (in-process, soft). */
export const SELF_RATING_UPDATES_PER_HOUR = 20;

export const selfRatingBodySchema = z.strictObject({
  /** LeetCode contest rating; null clears it. Never shown to anyone else. */
  leetcodeRating: z
    .number("Enter a number")
    .int("Use a whole number")
    .min(SELF_REPORTED_MIN, `Use ${SELF_REPORTED_MIN}–${SELF_REPORTED_MAX}`)
    .max(SELF_REPORTED_MAX, `Use ${SELF_REPORTED_MIN}–${SELF_REPORTED_MAX}`)
    .nullable(),
});
export type SelfRatingBody = z.infer<typeof selfRatingBodySchema>;
