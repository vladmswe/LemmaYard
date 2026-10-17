import type { VizModel } from "../../contracts";

import { mergeModel, type MergeInput, type MergeState } from "./model";

export * from "./model";
export { MERGE_DEFAULT, MERGE_PRESETS, randomMergeInput } from "./presets";

export const twoPointersModels: Readonly<Record<string, VizModel<MergeState, MergeInput>>> = {
  "twopointers.merge": mergeModel,
};
