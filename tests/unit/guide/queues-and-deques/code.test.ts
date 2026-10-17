// S4 for queues-and-deques: ring_queue and ring_deque carry exactly their
// model's line ids, and their cases agree with queue.ring / deque.ring.
import { describe, expect, it } from "vitest";

import { dequeRingModel, type DequeOp } from "@/lib/guide/traces/deque";
import { queueRingModel, type QueueOp, type RingResult } from "@/lib/guide/traces/queue";

import { loadCases } from "../helpers/cases";
import { expectLineIdsCovered } from "../helpers/viz-lines";

const isError = (v: unknown) => typeof v === "object" && v !== null && (v as { $error?: boolean }).$error === true;

describe("queues-and-deques code samples: line ids", () => {
  it("ring_queue and ring_deque carry exactly their model's line ids", () => {
    expectLineIdsCovered(queueRingModel, "queues-and-deques/ring_queue");
    expectLineIdsCovered(dequeRingModel, "queues-and-deques/ring_deque");
  });
});

describe("queues-and-deques code samples agree with the generators", () => {
  it("ring_queue: enqueue / dequeue / peek / size match queue.ring", () => {
    const cases = loadCases("queues-and-deques/ring_queue");
    if (cases.kind !== "class") throw new Error("expected a class cases file");
    expect(cases.cases.length).toBeGreaterThanOrEqual(6);
    for (const c of cases.cases) {
      const ops: QueueOp[] = [];
      const run = () => queueRingModel.generate({ ops }).result as RingResult;
      c.ops.forEach(([name, ...args], k) => {
        const expected = c.expected[k];
        const where = `${c.name}, op ${k + 1}`;
        if (name === "enqueue") {
          ops.push({ kind: "enqueue", value: args[0] as number });
          expect(expected, where).toBeNull();
        } else if (name === "dequeue" || name === "peek") {
          ops.push({ kind: name });
          const out = run().outputs.at(-1);
          if (isError(expected)) expect(out, where).toBeNull();
          else expect(out, where).toBe(expected);
        } else if (name === "size") {
          expect(run().values.length, where).toBe(expected);
        } else {
          throw new Error(`unknown op ${name}`);
        }
      });
    }
  });

  it("ring_deque: push_front / push_back / pop_front / pop_back match deque.ring", () => {
    const cases = loadCases("queues-and-deques/ring_deque");
    if (cases.kind !== "class") throw new Error("expected a class cases file");
    expect(cases.cases.length).toBeGreaterThanOrEqual(6);
    const kinds: Record<string, DequeOp["kind"]> = {
      push_front: "pushFront",
      push_back: "pushBack",
      pop_front: "popFront",
      pop_back: "popBack",
    };
    for (const c of cases.cases) {
      const ops: DequeOp[] = [];
      c.ops.forEach(([name, ...args], k) => {
        const expected = c.expected[k];
        const where = `${c.name}, op ${k + 1}`;
        const kind = kinds[name];
        if (kind === "pushFront" || kind === "pushBack") {
          ops.push({ kind, value: args[0] as number });
          expect(expected, where).toBeNull();
        } else if (kind === "popFront" || kind === "popBack") {
          ops.push({ kind });
          const out = (dequeRingModel.generate({ ops }).result as RingResult).outputs.at(-1);
          if (isError(expected)) expect(out, where).toBeNull();
          else expect(out, where).toBe(expected);
        } else {
          throw new Error(`unknown op ${name}`);
        }
      });
    }
  });
});
