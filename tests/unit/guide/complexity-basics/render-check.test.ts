import { describe, expect, it } from "vitest";

import { SearchRenderer } from "@/components/guide/viz/search/SearchRenderer";
import { searchBinaryModel } from "@/lib/guide/traces/search";

import { inspectSvg, parseSvg, renderFrame } from "./render-check";

// The checker itself must catch what AC-G-2-15 forbids, or a passing renderer test means nothing.
describe("render-check helper", () => {
  it("parses translations from transform attributes and inline styles", () => {
    const nodes = parseSvg(
      '<svg width="100" height="50"><g style="transform:translate(10px, 5px)"><g transform="translate(3, 4)"><rect x="1" y="2" width="5" height="5"/></g></g></svg>',
    );
    const rect = nodes.find((n) => n.tag === "rect")!;
    expect([rect.dx, rect.dy]).toEqual([13, 9]);
  });

  it("reports overflow, NaN, colour literals, small fonts, unknown text classes and missing ids", () => {
    const bad =
      '<svg width="100" height="50">' +
      '<rect x="90" y="0" width="20" height="10" fill="var(--viz-node-bg)"/>' +
      '<rect x="NaN" y="0" width="1" height="1"/>' +
      '<circle cx="5" cy="5" r="2" fill="#ff0000"/>' +
      '<text class="viz-label" x="5" y="10" font-size="10">a</text>' +
      '<text x="5" y="10">b</text>' +
      '<text class="viz-label" x="95" y="10" text-anchor="middle">wide label</text>' +
      "</svg>";
    const issues = inspectSvg(bad, { ids: ["c0"], thumb: false });
    const text = issues.join("\n");
    expect(text).toMatch(/rect right x=110/);
    expect(text).toMatch(/x="NaN"/);
    expect(text).toMatch(/#ff0000/);
    expect(text).toMatch(/font-size 10/);
    expect(text).toMatch(/without a viz text class/);
    expect(text).toMatch(/text "wide label" right/);
    expect(text).toMatch(/no data-id element for "c0"/);
  });

  it("finds every element of a real frame and no issue", () => {
    const t = searchBinaryModel.generate(searchBinaryModel.defaultInput);
    const frame = t.frames[2]!;
    const markup = renderFrame(SearchRenderer, frame, t.frames[1]!, 390, "full");
    const nodes = parseSvg(markup);
    expect(nodes.filter((n) => n.attrs["data-id"]).length).toBe(32);
    expect(nodes.some((n) => n.attrs["data-pointer"] === "mid")).toBe(true);
    expect(inspectSvg(markup, { ids: searchBinaryModel.ids(frame.state), thumb: false })).toEqual([]);
    expect(inspectSvg(renderFrame(SearchRenderer, frame, null, 320, "thumb"), { ids: [], thumb: true })).toEqual([]);
  });
});
