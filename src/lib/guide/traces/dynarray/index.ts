import type { VizModel } from "../../contracts";

import { dynArrayModel, type DynInput, type DynState } from "./model";

export * from "./model";
export { DYN_DEFAULT, DYN_PRESETS, randomDynInput } from "./presets";

export const dynArrayModels: Readonly<Record<string, VizModel<DynState, DynInput>>> = {
  "dynarray.ops": dynArrayModel,
};
