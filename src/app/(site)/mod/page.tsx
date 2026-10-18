import { ShieldIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "cn";

import { ModActionButton } from "@/components/community/mod-controls";
import { PageHead } from "@/components/page-head";
import { isModeratorRole, REPORT_REASON_LABELS } from "@/lib/community/types";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getCommunityViewer } from "@/server/community/access";
import { requireCommunityPage } from "@/server/community/flags";
import {
  listAuditLog,
  listHiddenPending,
  listOpenReports,
  type QueueItem,
} from "@/server/community/moderation";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Moderation · LemmaYard", robots: { index: false } };

const TABS = [
  { value: "open", label: "Open reports" },
  { value: "held", label: "Held and auto-hidden" },
  { value: "audit", label: "Audit log" },
] as const;
type Tab = (typeof TABS)[number]["value"];

const STATUS_LABEL: Record<QueueItem["status"], string> = {
  visible: "Visible",
  hidden_pending: "Hidden, waiting for review",
  removed: "Removed",
  deleted: "Deleted by its author",
};

function accountAge(createdAt: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(createdAt).getTime()) / 86_400_000);
  if (days < 1) return `account ${Math.max(1, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 3_600_000))} h old`;
  if (days < 60) return `account ${days} ${days === 1 ? "day" : "days"} old`;
  return `member ${Math.floor(days / 30)} months`;
}

function QueueRow({ item, now }: { item: QueueItem; now: Date }) {
  const where = item.problem ? `${item.depth === 1 ? "Reply" : "Comment"} on ${item.problem.title}` : "Comment";
  const permalink = item.problem ? `/problems/${item.problem.slug}/discuss?comment=${item.commentId}` : null;
  const author = item.author?.username ?? "deleted user";
  const target = { targetType: "comment" as const, targetId: item.commentId };
  return (
    <li
      className="grid gap-3 border-t px-4 py-4 first:border-t-0 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_5rem_minmax(0,1.2fr)_minmax(0,1.6fr)] lg:items-start lg:gap-4 lg:px-5"
      data-testid="mod-row"
    >
      <div className="min-w-0">
        <p className="font-semibold">
          {permalink ? (
            <Link href={permalink} className="hover:underline">
              {where}
            </Link>
          ) : (
            where
          )}
        </p>
        <p className="mt-1 border-l-2 border-border-strong pl-3 text-sm break-words text-foreground-secondary">{item.excerpt}</p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {STATUS_LABEL[item.status]}
          {item.hasSpoiler ? " · marked as a solution" : ""} ·{" "}
          <time dateTime={item.createdAt} title={formatDateTime(new Date(item.createdAt))}>
            posted {formatRelativeTime(new Date(item.createdAt), now)}
          </time>
        </p>
        {item.details.length > 0 && (
          <ul className="mt-2 grid gap-1 text-xs text-muted-foreground" aria-label="Reporter details">
            {item.details.map((d, i) => (
              <li key={i} className="break-words">
                “{d}”
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <span className="text-xs text-muted-foreground lg:sr-only">Reason: </span>
        {item.reasons.length === 0 ? (
          <span className="text-sm text-muted-foreground">Held by the spam rules</span>
        ) : (
          <ul className="inline-flex flex-wrap gap-1.5 lg:flex">
            {item.reasons.map((r) => (
              <li
                key={r.reason}
                className="rounded-sm border border-warning/40 bg-warning-bg px-1.5 text-xs leading-5 font-semibold text-warning"
              >
                {REPORT_REASON_LABELS[r.reason]}
                {r.count > 1 ? ` ×${r.count}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="text-sm">
        <span className="text-xs text-muted-foreground lg:sr-only">Reports: </span>
        <span className="font-semibold tabular-nums">{item.reportCount}</span>
        {item.status === "hidden_pending" && <span className="block text-xs text-muted-foreground">hidden</span>}
      </div>
      <div className="min-w-0 text-sm">
        <span className="text-xs text-muted-foreground lg:sr-only">Author: </span>
        {item.author ? (
          <Link href={`/u/${item.author.username}`} className="font-semibold hover:underline">
            {author}
          </Link>
        ) : (
          <span className="text-muted-foreground">{author}</span>
        )}
        {item.author && (
          <span className="block text-xs text-muted-foreground">
            {accountAge(item.author.createdAt, now)}
            {item.author.removals > 0 ? ` · ${item.author.removals} earlier ${item.author.removals === 1 ? "removal" : "removals"}` : ""}
            {item.author.suspendedUntil && new Date(item.author.suspendedUntil) > now ? " · suspended" : ""}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        {item.status === "visible" && item.reportCount > 0 && (
          <ModActionButton
            spec={{ action: "dismiss", ...target }}
            label="Dismiss"
            title="Dismiss these reports?"
            description="The comment stays visible and the reports are closed."
            defaultReason="Not a violation of the content policy"
            testId="mod-dismiss"
          />
        )}
        {item.status === "visible" && (
          <ModActionButton
            spec={{ action: "hide", ...target }}
            label="Hide"
            title="Hide this comment?"
            description="Only its author and moderators will see it until you restore or remove it."
            defaultReason={item.reasons[0] ? REPORT_REASON_LABELS[item.reasons[0].reason] : ""}
            testId="mod-hide"
          />
        )}
        {(item.status === "hidden_pending" || item.status === "removed") && (
          <ModActionButton
            spec={{ action: "restore", ...target }}
            label="Restore"
            title="Restore this comment?"
            description="It becomes visible again and its open reports are dismissed."
            defaultReason="Reviewed: within the content policy"
            testId="mod-restore"
          />
        )}
        {item.status !== "removed" && item.status !== "deleted" && (
          <ModActionButton
            spec={{ action: "remove", ...target }}
            label="Remove"
            title="Remove this comment?"
            description="Its body is replaced by “Removed by a moderator: <reason>”. The text is kept 90 days for appeals."
            defaultReason={item.reasons[0] ? REPORT_REASON_LABELS[item.reasons[0].reason] : ""}
            variant="destructive"
            testId="mod-remove"
          />
        )}
        {item.reasons.some((r) => r.reason === "unmarked_spoiler") && !item.hasSpoiler && item.status !== "deleted" && (
          <ModActionButton
            spec={{ action: "set_spoiler", value: true, ...target }}
            label="Mark as solution"
            title="Mark as containing a solution?"
            description="The body is hidden from people who have not solved the problem."
            defaultReason="Contains a full solution"
          />
        )}
        {item.author && (
          <ModActionButton
            spec={{ action: "suspend", targetType: "user", targetId: item.author.id, days: 7 }}
            label="Suspend 7 d"
            title={`Suspend ${author} for 7 days?`}
            description="No comments, votes or reports for 7 days. Practice, rooms and plans keep working."
            defaultReason="Repeated content policy violations"
            variant="ghost"
          />
        )}
        {item.author && (
          <ModActionButton
            spec={{ action: "suspend", targetType: "user", targetId: item.author.id, days: 30 }}
            label="Suspend 30 d"
            title={`Suspend ${author} for 30 days?`}
            description="No comments, votes or reports for 30 days. Practice, rooms and plans keep working."
            defaultReason="Repeated content policy violations"
            variant="ghost"
          />
        )}
      </div>
    </li>
  );
}

function QueueList({ items, now, empty }: { items: QueueItem[]; now: Date; empty: string }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border-strong px-5 py-8 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div
        aria-hidden
        className="hidden border-b bg-surface-sunken px-5 py-3 font-mono text-xs tracking-[0.06em] text-muted-foreground uppercase lg:grid lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_5rem_minmax(0,1.2fr)_minmax(0,1.6fr)] lg:gap-4"
      >
        <span>Content</span>
        <span>Reason</span>
        <span>Reports</span>
        <span>Author</span>
        <span className="text-right">Actions</span>
      </div>
      <ul aria-label="Moderation queue">
        {items.map((item) => (
          <QueueRow key={item.commentId} item={item} now={now} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Moderation queue (docs/specs/community.md §C.8 C1 minimum, AC-C-RP-4;
 * mockup 07). Moderators and admins only: everyone else gets a 404, like
 * any unknown page. Open reports oldest first, held / auto-hidden content,
 * and the audit log.
 */
export default async function ModerationPage({ searchParams }: PageProps<"/mod">) {
  requireCommunityPage();
  const user = await requireUser("/mod");
  const db = getDb();
  const now = new Date();
  const viewer = await getCommunityViewer(db, user.id, now);
  if (!viewer || !isModeratorRole(viewer.role)) notFound();
  const raw = (await searchParams).tab;
  const tab: Tab = TABS.some((t) => t.value === raw) ? (raw as Tab) : "open";

  const [open, held, audit] = await Promise.all([
    listOpenReports(db),
    listHiddenPending(db),
    tab === "audit" ? listAuditLog(db) : Promise.resolve([]),
  ]);
  const counts: Record<Tab, number | null> = { open: open.length, held: held.length, audit: null };

  return (
    <>
      <PageHead
        crumbs={[{ label: "Home", href: "/" }, { label: "Moderation" }]}
        title="Reports"
        qed
        subtitle="Open reports, oldest first. Content hidden automatically after 3 reports stays hidden until you decide."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning-bg px-2.5 py-1 text-xs font-semibold text-warning">
            <ShieldIcon aria-hidden className="size-3.5" />
            {viewer.role}
          </span>
        }
      />
      <div className="container-page grid gap-6 pt-6 pb-16">
        <nav aria-label="Moderation sections" className="flex flex-wrap gap-1 border-b">
          {TABS.map((t) => {
            const active = t.value === tab;
            const n = counts[t.value];
            return (
              <Link
                key={t.value}
                href={t.value === "open" ? "/mod" : `/mod?tab=${t.value}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center gap-1.5 px-3.5 text-sm font-medium text-muted-foreground transition-colors duration-120 hover:text-foreground",
                  active && "font-semibold text-foreground shadow-[inset_0_-2px_0_var(--primary)]",
                )}
              >
                {t.label}
                {n !== null && <span className="tabular-nums">· {n}</span>}
              </Link>
            );
          })}
        </nav>

        {tab === "open" && <QueueList items={open} now={now} empty="No open reports. Nothing to do." />}
        {tab === "held" && (
          <QueueList items={held} now={now} empty="Nothing is held for review or auto-hidden." />
        )}
        {tab === "audit" &&
          (audit.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border-strong px-5 py-8 text-center text-sm text-muted-foreground">
              No moderation actions yet.
            </p>
          ) : (
            <ol aria-label="Audit log" className="overflow-hidden rounded-xl border bg-card" data-testid="audit-log">
              {audit.map((a) => (
                <li key={a.id} className="grid gap-1 border-t px-5 py-3 text-sm first:border-t-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
                  <time dateTime={a.createdAt} className="text-muted-foreground tabular-nums">
                    {formatDateTime(new Date(a.createdAt))}
                  </time>
                  <div className="min-w-0">
                    <p>
                      <span className="font-semibold">{a.actor ?? "System"}</span>{" "}
                      <span className="font-mono text-xs">{a.action}</span> {a.targetType}{" "}
                      <span className="font-mono text-xs text-muted-foreground">{a.targetId.slice(0, 8)}</span>
                    </p>
                    <p className="break-words text-foreground-secondary">{a.reason}</p>
                  </div>
                </li>
              ))}
            </ol>
          ))}
        <p className="text-sm text-muted-foreground">
          Every action asks for a reason and writes the audit log. Roles are set with{" "}
          <code className="font-mono text-xs">pnpm user:role &lt;email&gt; &lt;role&gt;</code>.
        </p>
      </div>
    </>
  );
}
