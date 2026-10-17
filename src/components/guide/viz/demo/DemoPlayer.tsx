"use client";

import { TracePlayer } from "@/components/guide/player/TracePlayer";
import type { Trace, VizClientProps } from "@/lib/guide/contracts";
import {
  demoScanModel,
  demoTreeModel,
  randomScanInput,
  scanTable,
  treeTable,
  type ScanInput,
  type ScanState,
  type TreeInput,
  type TreeState,
} from "@/lib/guide/traces/demo/linear-scan";

import { ScanRenderer, TreeRenderer } from "./DemoRenderer";

/** Client player of the M-G0 fixtures ("demo.scan", "demo.tree"). */
export function DemoPlayer(props: VizClientProps<unknown>) {
  if (props.vizId === "demo.tree") {
    return (
      <TracePlayer<TreeState, TreeInput>
        playerId={props.playerId}
        model={demoTreeModel}
        Renderer={TreeRenderer}
        initialInput={props.initialInput as TreeInput}
        initialTrace={props.initialTrace as Trace<TreeState>}
        code={props.code}
        hint={props.hint}
        toTable={treeTable}
      />
    );
  }
  return (
    <TracePlayer<ScanState, ScanInput>
      playerId={props.playerId}
      model={demoScanModel}
      Renderer={ScanRenderer}
      initialInput={props.initialInput as ScanInput}
      initialTrace={props.initialTrace as Trace<ScanState>}
      code={props.code}
      hint={props.hint}
      toTable={scanTable}
      randomInput={randomScanInput}
    />
  );
}
