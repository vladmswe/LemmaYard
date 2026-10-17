"use client";

import { TracePlayer } from "@/components/guide/player/TracePlayer";
import type { Trace, VizClientProps } from "@/lib/guide/contracts";
import {
  randomSearchInput,
  SEARCH_OPS,
  searchModels,
  searchLinearModel,
  searchTable,
  type SearchInput,
  type SearchOp,
  type SearchState,
} from "@/lib/guide/traces/search";

import { SearchRenderer } from "./SearchRenderer";

/** Client player of "search.linear" / "search.binary": one player, op selector switches the search. */
export function SearchPlayer(props: VizClientProps<SearchInput>) {
  const model = searchModels[props.vizId] ?? searchLinearModel;
  return (
    <TracePlayer<SearchState, SearchInput>
      playerId={props.playerId}
      model={model}
      Renderer={SearchRenderer}
      initialInput={props.initialInput}
      initialTrace={props.initialTrace as Trace<SearchState>}
      code={props.code}
      hint={props.hint}
      ops={SEARCH_OPS}
      opOf={(input) => input.op}
      withOp={(input, op) => ({ ...input, op: op as SearchOp })}
      toTable={searchTable}
      randomInput={(seed) => randomSearchInput(seed, model.defaultInput.op)}
    />
  );
}
