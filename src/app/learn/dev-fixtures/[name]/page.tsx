import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ArrayRow } from "@/components/guide/svg/ArrayRow";
import { Arrow } from "@/components/guide/svg/Arrow";
import { Buckets } from "@/components/guide/svg/Buckets";
import { Cell } from "@/components/guide/svg/Cell";
import { GraphView } from "@/components/guide/svg/GraphView";
import { Legend } from "@/components/guide/svg/Legend";
import { NodeBox } from "@/components/guide/svg/NodeBox";
import { TreeNode } from "@/components/guide/svg/Tree";
import { VizSvg } from "@/components/guide/svg/VizSvg";
import { DemoPlayer } from "@/components/guide/viz/demo/DemoPlayer";
import { SCAN_CODE } from "@/components/guide/viz/demo/scan-code";
import { ROLES } from "@/lib/guide/contracts";
import { demoScanModel, demoTreeModel } from "@/lib/guide/traces/demo/linear-scan";
import { getEnv } from "@/server/env";

import { fixturesEnabled } from "../guard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Player fixture · leetcopy",
  robots: { index: false, follow: false },
};

const SCAN_HINT = "Try: press Next, or pick 'Target missing'.";

function ScanFixture({ playerId, withCode }: { playerId: string; withCode?: boolean }) {
  const input = demoScanModel.defaultInput;
  return (
    <DemoPlayer
      playerId={playerId}
      vizId="demo.scan"
      initialInput={input}
      initialTrace={demoScanModel.generate(input)}
      code={withCode ? SCAN_CODE : undefined}
      hint={SCAN_HINT}
    />
  );
}

function TreeFixture({ playerId }: { playerId: string }) {
  const input = demoTreeModel.defaultInput;
  return (
    <DemoPlayer
      playerId={playerId}
      vizId="demo.tree"
      initialInput={input}
      initialTrace={demoTreeModel.generate(input)}
      hint="Try: press Next and predict which way the search goes."
    />
  );
}

/** One swatch per role next to a default cell, plus every primitive once (contrast + axe checks). */
function Swatches() {
  return (
    <div className="viz space-y-6">
      <Legend roles={ROLES} />
      <div className="viz-figure-bg overflow-x-auto rounded-lg p-3" data-swatches="">
        <VizSvg width={ROLES.length * 64 + 80} height={84} title="Role swatches" fit={false}>
          <Cell id="sw-default" x={8} y={24} w={48} h={40} value={7} sub="default" />
          {ROLES.map((role, k) => (
            <g key={role} data-swatch-role={role}>
              <Cell id={`sw-${role}`} x={80 + k * 64} y={24} w={48} h={40} value={7} role={role} sub={role} />
            </g>
          ))}
        </VizSvg>
      </div>
      <div className="viz-figure-bg overflow-x-auto rounded-lg p-3">
        <VizSvg width={560} height={300} title="Primitive gallery" fit={false}>
          <ArrayRow
            items={[
              { id: "a1", value: 3 },
              { id: "a2", value: 5 },
            ]}
            x={8}
            y={20}
            cellW={40}
            capacity={4}
            showIndices
            roles={{ a2: "new" }}
          />
          <NodeBox
            id="nb"
            x={220}
            y={20}
            fields={[
              { name: "val", value: 12 },
              { name: "next", value: "•" },
            ]}
            role="current"
          />
          <Arrow from={{ x: 330, y: 38 }} to={{ x: 400, y: 38 }} label="next" role="changed" />
          <TreeNode id="tn" x={440} y={40} label={9} sub="9 / 3" role="done" />
          <g transform="translate(8, 110)">
            <Buckets
              buckets={[
                { id: "b0", items: [{ id: "k1", label: "cat" }] },
                { id: "b1", items: [] },
              ]}
              orientation="vertical"
              roles={{ k1: "compared" }}
            />
          </g>
          <g transform="translate(260, 110)">
            <GraphView
              width={280}
              height={170}
              nodes={[
                { id: "g1", x: 10, y: 20, label: "A" },
                { id: "g2", x: 90, y: 20, label: "B" },
                { id: "g3", x: 50, y: 90, label: "C" },
              ]}
              edges={[
                { id: "e1", from: "g1", to: "g2", directed: true, weight: 4 },
                { id: "e2", from: "g2", to: "g3", directed: false },
              ]}
              roles={{ g1: "visited", g2: "frontier", e1: "path" }}
            />
          </g>
        </VizSvg>
      </div>
    </div>
  );
}

const FIXTURES: Record<string, { title: string; render: () => ReactNode }> = {
  scan: { title: "Linear scan", render: () => <ScanFixture playerId="scan" /> },
  "scan-code": { title: "Linear scan with code", render: () => <ScanFixture playerId="scan" withCode /> },
  tree: { title: "Tree search", render: () => <TreeFixture playerId="tree" /> },
  "two-players": {
    title: "Two players",
    render: () => (
      <div className="space-y-8">
        <ScanFixture playerId="first" />
        <TreeFixture playerId="second" />
      </div>
    ),
  },
  swatches: { title: "Role swatches", render: () => <Swatches /> },
};

export default async function DevFixturePage({ params }: PageProps<"/learn/dev-fixtures/[name]">) {
  if (!fixturesEnabled(getEnv())) notFound();
  const { name } = await params;
  const fixture = Object.hasOwn(FIXTURES, name) ? FIXTURES[name] : undefined;
  if (!fixture) notFound();
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Fixture: {fixture.title}</h1>
      {fixture.render()}
    </section>
  );
}
