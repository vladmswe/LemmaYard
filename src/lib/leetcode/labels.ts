// User-facing copy of the LeetCode catalog (docs/specs/leetcode-integration.md
// §6.8): "estimated" labels, rating sources and the attribution. Pure.
import type { DifficultySource, OverlaySource, RatingSource } from "./catalog-schema";

/** Which values of a LeetCode slot are estimates (shown next to them). */
export type LeetCodeProvenance = {
  /** The difficulty was derived from the rating or estimated, not set by the owner. */
  difficultyEstimated: boolean;
  ratingSource: RatingSource | null;
  /** Topic tags were estimated (not confirmed by the owner). */
  tagsEstimated: boolean;
};

export function provenanceOf(p: {
  difficultySource: DifficultySource | null;
  ratingSource: RatingSource | null;
  tagsSource: OverlaySource | null;
}): LeetCodeProvenance {
  return {
    difficultyEstimated: p.difficultySource === "rating" || p.difficultySource === "estimated",
    ratingSource: p.ratingSource,
    tagsEstimated: p.tagsSource === "estimated",
  };
}

export const ESTIMATED_LABEL = "estimated";

export const DIFFICULTY_ESTIMATED_HELP =
  "Difficulty estimated from the community contest rating, not LeetCode's own label.";

const RATING_SOURCE_HELP: Record<RatingSource, string> = {
  zerotrac: "Community contest rating (zerotrac/leetcode_problem_rating). An estimate, not LeetCode's.",
  owner: "Rating estimated by the site owner.",
  estimated: "Rating estimated, not confirmed by the site owner.",
};

export function ratingSourceHelp(source: RatingSource): string {
  return RATING_SOURCE_HELP[source];
}

export const TAGS_ESTIMATED_HELP = "Topics estimated by LemmaYard, not LeetCode's own tags; they may be wrong.";

/** Short credit line (lobby help, footer). */
export const LEETCODE_ATTRIBUTION = "LeetCode ratings: zerotrac (MIT)";

export const LEETCODE_NOT_AFFILIATED =
  "LeetCode is a trademark of LeetCode LLC. LemmaYard is not affiliated with or endorsed by LeetCode.";

/** Help of the lobby / preset switch. */
export function autoPickHelp(size: number): string {
  return `From a list of ${size.toLocaleString("en-US")} LeetCode contest problems with community ratings (zerotrac). Links only; results are self-reported and never change ratings.`;
}

export const AUTO_PICK_LABEL = "Pick LeetCode problems automatically";

export const TOPICS_IGNORED_NOTICE =
  "Not enough LeetCode problems are tagged with these topics; LeetCode slots ignore the topics.";
