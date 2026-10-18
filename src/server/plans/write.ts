// Study plan writes (docs/specs/community.md §B.8, §C.2; AC-C-SP-1, -2, -5).
// Every function is one route: planWrite() runs it in a transaction that holds
// the caller's advisory lock, so per-user limits (50 plans, 300 items, 20
// sections, the hourly write budget) are race free. Only the owner changes a
// plan; viewers who can read it tick external items, save and duplicate it.
import { randomUUID } from "node:crypto";

import { and, asc, count, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { NextResponse } from "next/server";

import { isPermutationOf, layoutPositions } from "@/lib/plans/layout";
import {
  addItemsBodySchema,
  createPlanWithItemsBodySchema,
  createSectionBodySchema,
  duplicateBodySchema,
  emptyBodySchema,
  layoutBodySchema,
  MAX_ITEMS_PER_PLAN,
  MAX_PLANS_PER_USER,
  MAX_SECTIONS_PER_PLAN,
  type NewItemInput,
  renameSectionBodySchema,
  saveBodySchema,
  tickBodySchema,
  updateItemBodySchema,
  updatePlanBodySchema,
} from "@/lib/plans/schemas";
import { problems, studyPlanItems, studyPlans, studyPlanSaves, studyPlanSections, studyPlanTicks } from "@/server/db/schema";
import { jsonError } from "@/server/http/request";

import { findReadablePlan, generateShareToken, isPlanId } from "./access";
import { json, ownedPlan, planNotFound, planWrite, rateLimited } from "./http";
import type { Tx } from "./types";

export const PLAN_LIMIT_MESSAGE = `You can have at most ${MAX_PLANS_PER_USER} study plans. Delete one first.`;
export const ITEM_LIMIT_MESSAGE = `A plan holds at most ${MAX_ITEMS_PER_PLAN} problems.`;
export const SECTION_LIMIT_MESSAGE = `A plan has at most ${MAX_SECTIONS_PER_PLAN} sections.`;
const ITEM_NOT_FOUND = "Item not found";
const SECTION_NOT_FOUND = "Section not found";

/** 409 when the user already has the maximum number of plans. */
export async function planLimitReached(tx: Tx, userId: string): Promise<boolean> {
  const [row] = await tx.select({ n: count() }).from(studyPlans).where(eq(studyPlans.ownerId, userId));
  return row.n >= MAX_PLANS_PER_USER;
}

function touch(tx: Tx, planId: string, extra: Partial<Record<"itemCount", SQL>> = {}) {
  return tx
    .update(studyPlans)
    .set({ updatedAt: sql`now()`, ...extra })
    .where(eq(studyPlans.id, planId));
}

// --- Items ------------------------------------------------------------------

type SectionTarget = { id: string } | { title: string } | undefined;

/** The section id for new items: an existing one (by id, or by title, case-insensitive) or a new one. */
async function resolveSection(
  tx: Tx,
  planId: string,
  target: SectionTarget,
): Promise<{ sectionId: string | null } | { response: NextResponse }> {
  if (!target) return { sectionId: null };
  if ("id" in target) {
    const [row] = await tx
      .select({ id: studyPlanSections.id })
      .from(studyPlanSections)
      .where(and(eq(studyPlanSections.id, target.id), eq(studyPlanSections.planId, planId)))
      .limit(1);
    return row ? { sectionId: row.id } : { response: jsonError(404, SECTION_NOT_FOUND) };
  }
  const existing = await tx
    .select({ id: studyPlanSections.id, title: studyPlanSections.title, position: studyPlanSections.position })
    .from(studyPlanSections)
    .where(eq(studyPlanSections.planId, planId))
    .orderBy(asc(studyPlanSections.position));
  const match = existing.find((s) => s.title.toLocaleLowerCase("en") === target.title.toLocaleLowerCase("en"));
  if (match) return { sectionId: match.id };
  if (existing.length >= MAX_SECTIONS_PER_PLAN) return { response: jsonError(409, SECTION_LIMIT_MESSAGE) };
  const position = existing.reduce((m, s) => Math.max(m, s.position + 1), 0);
  const [row] = await tx
    .insert(studyPlanSections)
    .values({ planId, title: target.title, position })
    .returning({ id: studyPlanSections.id });
  return { sectionId: row.id };
}

/**
 * Appends `items` to the plan (in that order, after the target group's last
 * item). Unknown or unpublished problems → 404; problems already in the plan,
 * or repeated in the batch, are skipped (§B.8 "Duplicates are skipped").
 */
export async function addItemsTx(
  tx: Tx,
  plan: { id: string; itemCount: number },
  items: NewItemInput[],
  sectionTarget: SectionTarget,
): Promise<{ added: number; skipped: number } | { response: NextResponse }> {
  const slugs = [...new Set(items.flatMap((i) => ("problemSlug" in i ? [i.problemSlug] : [])))];
  const found =
    slugs.length === 0
      ? []
      : await tx
          .select({ id: problems.id, slug: problems.slug })
          .from(problems)
          .where(and(inArray(problems.slug, slugs), eq(problems.published, true)));
  if (found.length !== slugs.length) {
    return { response: jsonError(404, "Problem not found") };
  }
  const idBySlug = new Map(found.map((p) => [p.slug, p.id]));
  const existing = await tx
    .select({ problemId: studyPlanItems.problemId, externalSlug: studyPlanItems.externalSlug })
    .from(studyPlanItems)
    .where(eq(studyPlanItems.planId, plan.id));
  const seen = new Set(existing.map((e) => e.problemId ?? `lc:${e.externalSlug}`));

  type Row = { problemId: string | null; externalSlug: string | null; externalTitle: string | null; note: string | null };
  const rows: Row[] = [];
  for (const item of items) {
    const row: Row =
      "problemSlug" in item
        ? { problemId: idBySlug.get(item.problemSlug)!, externalSlug: null, externalTitle: null, note: item.note || null }
        : { problemId: null, externalSlug: item.leetcodeUrl, externalTitle: item.title ?? null, note: item.note || null };
    const key = row.problemId ?? `lc:${row.externalSlug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  const skipped = items.length - rows.length;
  if (rows.length === 0) return { added: 0, skipped };
  if (plan.itemCount + rows.length > MAX_ITEMS_PER_PLAN) return { response: jsonError(409, ITEM_LIMIT_MESSAGE) };

  const section = await resolveSection(tx, plan.id, sectionTarget);
  if ("response" in section) return section;
  const [{ next }] = await tx
    .select({ next: sql<number>`coalesce(max(${studyPlanItems.position}) + 1, 0)::int` })
    .from(studyPlanItems)
    .where(
      and(
        eq(studyPlanItems.planId, plan.id),
        section.sectionId === null ? isNull(studyPlanItems.sectionId) : eq(studyPlanItems.sectionId, section.sectionId),
      ),
    );
  await tx
    .insert(studyPlanItems)
    .values(rows.map((r, i) => ({ ...r, planId: plan.id, sectionId: section.sectionId, position: next + i })));
  await touch(tx, plan.id, { itemCount: sql`${studyPlans.itemCount} + ${rows.length}` });
  return { added: rows.length, skipped };
}

/** POST /api/plans `{title, description?, visibility?, items?, section?}` → 201 `{id, added, skipped}`. */
export function createPlan(request: Request) {
  return planWrite(request, createPlanWithItemsBodySchema, "create", async ({ tx, user, data }) => {
    if (await planLimitReached(tx, user.id)) return jsonError(409, PLAN_LIMIT_MESSAGE);
    const limited = await rateLimited(tx, user.id, data.items?.length ? 2 : 1);
    if (limited) return limited;
    const visibility = data.visibility ?? "private";
    const [plan] = await tx
      .insert(studyPlans)
      .values({
        ownerId: user.id,
        title: data.title,
        description: data.description || null,
        visibility,
        shareToken: visibility === "unlisted" ? generateShareToken() : null,
      })
      .returning({ id: studyPlans.id });
    let result = { added: 0, skipped: 0 };
    if (data.items?.length) {
      const added = await addItemsTx(tx, { id: plan.id, itemCount: 0 }, data.items, data.section);
      if ("response" in added) {
        // Nothing of a rejected request may stay: undo the plan as well.
        await tx.delete(studyPlans).where(eq(studyPlans.id, plan.id));
        return added.response;
      }
      result = added;
    }
    return json({ id: plan.id, ...result }, 201);
  });
}

/** POST /api/plans/[id]/items `{items, section?}` (owner) → 200 `{added, skipped}`. */
export function addItems(request: Request, planId: string) {
  return planWrite(request, addItemsBodySchema, "add_items", async ({ tx, user, data }) => {
    const owned = await ownedPlan(tx, planId, user.id);
    if ("response" in owned) return owned.response;
    const limited = await rateLimited(tx, user.id);
    if (limited) return limited;
    const result = await addItemsTx(tx, owned.plan, data.items, data.section);
    return "response" in result ? result.response : json(result);
  });
}

/** PATCH /api/plans/[id]/items `{unsectioned, sections}`: the full order (owner). */
export function setLayout(request: Request, planId: string) {
  return planWrite(request, layoutBodySchema, "layout", async ({ tx, user, data }) => {
    const owned = await ownedPlan(tx, planId, user.id);
    if ("response" in owned) return owned.response;
    const [items, sections] = await Promise.all([
      tx.select({ id: studyPlanItems.id }).from(studyPlanItems).where(eq(studyPlanItems.planId, planId)),
      tx.select({ id: studyPlanSections.id }).from(studyPlanSections).where(eq(studyPlanSections.planId, planId)),
    ]);
    if (!isPermutationOf(data, items.map((i) => i.id), sections.map((s) => s.id))) {
      return jsonError(409, "The plan changed in another tab. Reload and try again.");
    }
    const positions = layoutPositions(data);
    if (positions.items.length > 0) {
      const values = sql.join(
        positions.items.map((p) => sql`(${p.id}::uuid, ${p.sectionId}::uuid, ${p.position}::int)`),
        sql`, `,
      );
      await tx.execute(sql`UPDATE ${studyPlanItems} AS i SET section_id = v.section_id, position = v.position
        FROM (VALUES ${values}) AS v(id, section_id, position)
        WHERE i.id = v.id AND i.plan_id = ${planId}`);
    }
    if (positions.sections.length > 0) {
      const values = sql.join(
        positions.sections.map((p) => sql`(${p.id}::uuid, ${p.position}::int)`),
        sql`, `,
      );
      await tx.execute(sql`UPDATE ${studyPlanSections} AS s SET position = v.position
        FROM (VALUES ${values}) AS v(id, position)
        WHERE s.id = v.id AND s.plan_id = ${planId}`);
    }
    await touch(tx, planId);
    return json({ ok: true });
  });
}

async function findItem(tx: Tx, planId: string, itemId: string) {
  if (!isPlanId(itemId)) return null;
  const [row] = await tx
    .select({ id: studyPlanItems.id, externalSlug: studyPlanItems.externalSlug })
    .from(studyPlanItems)
    .where(and(eq(studyPlanItems.id, itemId), eq(studyPlanItems.planId, planId)))
    .limit(1);
  return row ?? null;
}

/** PATCH /api/plans/[id]/items/[itemId] `{note?, title?}` (owner; title for external items only). */
export function updateItem(request: Request, planId: string, itemId: string) {
  return planWrite(request, updateItemBodySchema, "update_item", async ({ tx, user, data }) => {
    const owned = await ownedPlan(tx, planId, user.id);
    if ("response" in owned) return owned.response;
    const item = await findItem(tx, planId, itemId);
    if (!item) return jsonError(404, ITEM_NOT_FOUND);
    if (data.title !== undefined && item.externalSlug === null) {
      return jsonError(400, "Only LeetCode items have an editable title", { title: "Only LeetCode items have an editable title" });
    }
    await tx
      .update(studyPlanItems)
      .set({
        ...(data.note !== undefined ? { note: data.note || null } : {}),
        ...(data.title !== undefined ? { externalTitle: data.title } : {}),
      })
      .where(eq(studyPlanItems.id, item.id));
    await touch(tx, planId);
    return json({ ok: true });
  });
}

/** DELETE /api/plans/[id]/items/[itemId] `{}` (owner). */
export function deleteItem(request: Request, planId: string, itemId: string) {
  return planWrite(request, emptyBodySchema, "delete_item", async ({ tx, user }) => {
    const owned = await ownedPlan(tx, planId, user.id);
    if ("response" in owned) return owned.response;
    const item = await findItem(tx, planId, itemId);
    if (!item) return jsonError(404, ITEM_NOT_FOUND);
    await tx.delete(studyPlanItems).where(eq(studyPlanItems.id, item.id));
    await touch(tx, planId, { itemCount: sql`${studyPlans.itemCount} - 1` });
    return json({ ok: true });
  });
}

// --- Sections ---------------------------------------------------------------

/** POST /api/plans/[id]/sections `{title}` (owner) → 201 `{id}`. */
export function createSection(request: Request, planId: string) {
  return planWrite(request, createSectionBodySchema, "create_section", async ({ tx, user, data }) => {
    const owned = await ownedPlan(tx, planId, user.id);
    if ("response" in owned) return owned.response;
    const [{ n, next }] = await tx
      .select({ n: count(), next: sql<number>`coalesce(max(${studyPlanSections.position}) + 1, 0)::int` })
      .from(studyPlanSections)
      .where(eq(studyPlanSections.planId, planId));
    if (n >= MAX_SECTIONS_PER_PLAN) return jsonError(409, SECTION_LIMIT_MESSAGE);
    const limited = await rateLimited(tx, user.id);
    if (limited) return limited;
    const [row] = await tx
      .insert(studyPlanSections)
      .values({ planId, title: data.title, position: next })
      .returning({ id: studyPlanSections.id });
    await touch(tx, planId);
    return json({ id: row.id }, 201);
  });
}

async function findSection(tx: Tx, planId: string, sectionId: string) {
  if (!isPlanId(sectionId)) return null;
  const [row] = await tx
    .select({ id: studyPlanSections.id })
    .from(studyPlanSections)
    .where(and(eq(studyPlanSections.id, sectionId), eq(studyPlanSections.planId, planId)))
    .limit(1);
  return row ?? null;
}

/** PATCH /api/plans/[id]/sections/[sectionId] `{title}` (owner). */
export function renameSection(request: Request, planId: string, sectionId: string) {
  return planWrite(request, renameSectionBodySchema, "rename_section", async ({ tx, user, data }) => {
    const owned = await ownedPlan(tx, planId, user.id);
    if ("response" in owned) return owned.response;
    const section = await findSection(tx, planId, sectionId);
    if (!section) return jsonError(404, SECTION_NOT_FOUND);
    await tx.update(studyPlanSections).set({ title: data.title }).where(eq(studyPlanSections.id, section.id));
    await touch(tx, planId);
    return json({ ok: true });
  });
}

/** DELETE /api/plans/[id]/sections/[sectionId] `{}` (owner): its items move to the end of the top list. */
export function deleteSection(request: Request, planId: string, sectionId: string) {
  return planWrite(request, emptyBodySchema, "delete_section", async ({ tx, user }) => {
    const owned = await ownedPlan(tx, planId, user.id);
    if ("response" in owned) return owned.response;
    const section = await findSection(tx, planId, sectionId);
    if (!section) return jsonError(404, SECTION_NOT_FOUND);
    await tx.execute(sql`UPDATE ${studyPlanItems} SET section_id = NULL,
      position = position + (SELECT coalesce(max(position) + 1, 0) FROM ${studyPlanItems} WHERE plan_id = ${planId} AND section_id IS NULL)
      WHERE plan_id = ${planId} AND section_id = ${section.id}`);
    await tx.delete(studyPlanSections).where(eq(studyPlanSections.id, section.id));
    await touch(tx, planId);
    return json({ ok: true });
  });
}

// --- Plan settings ----------------------------------------------------------

/** PATCH /api/plans/[id] `{title?, description?, visibility?, resetShareLink?}` (owner) → `{visibility, shareToken}`. */
export function updatePlan(request: Request, planId: string) {
  return planWrite(request, updatePlanBodySchema, "update", async ({ tx, user, data }) => {
    const owned = await ownedPlan(tx, planId, user.id);
    if ("response" in owned) return owned.response;
    const visibility = data.visibility ?? owned.plan.visibility;
    let shareToken = owned.plan.shareToken;
    if (data.resetShareLink || (visibility === "unlisted" && shareToken === null)) shareToken = generateShareToken();
    await tx
      .update(studyPlans)
      .set({
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        visibility,
        shareToken,
        updatedAt: sql`now()`,
      })
      .where(eq(studyPlans.id, planId));
    return json({ visibility, shareToken });
  });
}

/** DELETE /api/plans/[id] `{}` (owner): the plan, its sections, items, ticks and saves. */
export function deletePlan(request: Request, planId: string) {
  return planWrite(request, emptyBodySchema, "delete", async ({ tx, user }) => {
    const owned = await ownedPlan(tx, planId, user.id);
    if ("response" in owned) return owned.response;
    await tx.delete(studyPlans).where(eq(studyPlans.id, planId));
    return json({ deleted: true });
  });
}

// --- Viewer actions -----------------------------------------------------------

/** PUT /api/plans/[id]/items/[itemId]/tick `{done, share?}`: the viewer's own "Mark done" on an external item. */
export function setTick(request: Request, planId: string, itemId: string) {
  return planWrite(request, tickBodySchema, "tick", async ({ tx, user, data }) => {
    const plan = await findReadablePlan(tx, planId, user.id, data.share);
    if (!plan) return planNotFound();
    const item = await findItem(tx, planId, itemId);
    if (!item) return jsonError(404, ITEM_NOT_FOUND);
    if (item.externalSlug === null) {
      return jsonError(409, "Problems on LemmaYard are marked done by an accepted submission");
    }
    if (data.done) {
      const limited = await rateLimited(tx, user.id);
      if (limited) return limited;
      await tx
        .insert(studyPlanTicks)
        .values({ userId: user.id, itemId: item.id })
        .onConflictDoUpdate({ target: [studyPlanTicks.userId, studyPlanTicks.itemId], set: { doneAt: sql`now()` } });
    } else {
      await tx
        .delete(studyPlanTicks)
        .where(and(eq(studyPlanTicks.userId, user.id), eq(studyPlanTicks.itemId, item.id)));
    }
    return json({ done: data.done });
  });
}

/** PUT /api/plans/[id]/save `{saved, share?}`: follow a public or unlisted plan of someone else. */
export function setSaved(request: Request, planId: string) {
  return planWrite(request, saveBodySchema, "save", async ({ tx, user, data }) => {
    const plan = await findReadablePlan(tx, planId, user.id, data.share);
    if (!plan) return planNotFound();
    if (plan.role === "owner") return jsonError(409, "This is your own plan");
    if (data.saved) {
      const limited = await rateLimited(tx, user.id);
      if (limited) return limited;
      const inserted = await tx
        .insert(studyPlanSaves)
        .values({ userId: user.id, planId, shareToken: plan.visibility === "unlisted" ? plan.viaToken : null })
        .onConflictDoUpdate({
          target: [studyPlanSaves.userId, studyPlanSaves.planId],
          // A save made with an old link follows the new one the user opened it with.
          set: { shareToken: plan.visibility === "unlisted" ? plan.viaToken : null },
        })
        .returning({ fresh: sql<boolean>`xmax = 0` });
      if (inserted[0]?.fresh) {
        await tx.update(studyPlans).set({ saveCount: sql`${studyPlans.saveCount} + 1` }).where(eq(studyPlans.id, planId));
      }
    } else {
      const removed = await tx
        .delete(studyPlanSaves)
        .where(and(eq(studyPlanSaves.userId, user.id), eq(studyPlanSaves.planId, planId)))
        .returning({ planId: studyPlanSaves.planId });
      if (removed.length > 0) {
        await tx
          .update(studyPlans)
          .set({ saveCount: sql`greatest(${studyPlans.saveCount} - 1, 0)` })
          .where(eq(studyPlans.id, planId));
      }
    }
    return json({ saved: data.saved });
  });
}

/**
 * POST /api/plans/[id]/duplicate `{share?}` → 201 `{id}`: a private copy (title,
 * description, sections, items, notes) with `forked_from_id`. Ticks and saves
 * are not copied.
 */
export function duplicatePlan(request: Request, planId: string) {
  return planWrite(request, duplicateBodySchema, "duplicate", async ({ tx, user, data }) => {
    const source = await findReadablePlan(tx, planId, user.id, data.share);
    if (!source) return planNotFound();
    if (await planLimitReached(tx, user.id)) return jsonError(409, PLAN_LIMIT_MESSAGE);
    const limited = await rateLimited(tx, user.id, 2);
    if (limited) return limited;
    const [full] = await tx
      .select({ title: studyPlans.title, description: studyPlans.description })
      .from(studyPlans)
      .where(eq(studyPlans.id, planId));
    const [sections, items] = await Promise.all([
      tx
        .select({ id: studyPlanSections.id, title: studyPlanSections.title, position: studyPlanSections.position })
        .from(studyPlanSections)
        .where(eq(studyPlanSections.planId, planId)),
      tx
        .select({
          sectionId: studyPlanItems.sectionId,
          position: studyPlanItems.position,
          problemId: studyPlanItems.problemId,
          externalSlug: studyPlanItems.externalSlug,
          externalTitle: studyPlanItems.externalTitle,
          note: studyPlanItems.note,
        })
        .from(studyPlanItems)
        .where(eq(studyPlanItems.planId, planId)),
    ]);
    const [copy] = await tx
      .insert(studyPlans)
      .values({
        ownerId: user.id,
        title: full.title,
        description: full.description,
        source: "clone",
        forkedFromId: planId,
        itemCount: items.length,
      })
      .returning({ id: studyPlans.id });
    const newSectionId = new Map(sections.map((s) => [s.id, randomUUID()]));
    if (sections.length > 0) {
      await tx
        .insert(studyPlanSections)
        .values(sections.map((s) => ({ id: newSectionId.get(s.id)!, planId: copy.id, title: s.title, position: s.position })));
    }
    if (items.length > 0) {
      await tx.insert(studyPlanItems).values(
        items.map((i) => ({
          ...i,
          planId: copy.id,
          sectionId: i.sectionId === null ? null : (newSectionId.get(i.sectionId) ?? null),
        })),
      );
    }
    return json({ id: copy.id }, 201);
  });
}

