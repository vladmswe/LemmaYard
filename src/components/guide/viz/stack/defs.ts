// Visualization definitions the stacks lesson hands to <Viz def={...}>.
import type { ComponentType } from "react";

import type { VizClientProps, VizDefinition } from "@/lib/guide/contracts";
import {
  stackBracketsModel,
  stackMonotonicModel,
  stackOpsModel,
  type BracketsInput,
  type BracketsState,
  type MonoInput,
  type MonoState,
  type StackInput,
  type StackState,
} from "@/lib/guide/traces/stack";

import { LazyStackPlayer } from "./LazyPlayer";

// One client player serves the three models; it picks the model by vizId.
const client = <I,>() => LazyStackPlayer as unknown as ComponentType<VizClientProps<I>>;

export const stackOps: VizDefinition<StackState, StackInput> = { model: stackOpsModel, Client: client<StackInput>() };
export const stackBrackets: VizDefinition<BracketsState, BracketsInput> = { model: stackBracketsModel, Client: client<BracketsInput>() };
export const stackMonotonic: VizDefinition<MonoState, MonoInput> = { model: stackMonotonicModel, Client: client<MonoInput>() };
