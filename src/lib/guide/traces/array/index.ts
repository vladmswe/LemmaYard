import type { VizModel } from "../../contracts";

import { arrayShiftModel, type ArrayInput, type ArrayState } from "./model";

export * from "./model";
export { ARRAY_DEFAULT, ARRAY_PRESETS, randomArrayInput } from "./presets";
export type { ArrayOpOutcome } from "./shift";

export const arrayModels: Readonly<Record<string, VizModel<ArrayState, ArrayInput>>> = {
  "array.shift": arrayShiftModel,
};
