"use client";

import { CircleAlertIcon, InfoIcon, LogInIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { clearInviteToken, takeInviteToken } from "@/lib/rooms/invite-storage";

import { postJson } from "./room-api";

type Preview = {
  name: string;
  memberCount: number;
  memberNames: string[];
  shareSolutions: boolean;
  alreadyMember: boolean;
  roomId?: string;
};

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "guest" }
  | { kind: "preview"; token: string; preview: Preview }
  | { kind: "error"; message: string; token: string | null };

export const INVALID_LINK_COPY = "This invite link is invalid or has expired. Ask the room owner for a new one.";
const NEXT = encodeURIComponent("/rooms/join");

/**
 * /rooms/join#<token> (spec §1.2 step 2, §7.4, §8.1). The token is read from
 * the fragment on the client, kept in sessionStorage for the login detour and
 * sent only in POST bodies. The preview is fetched only for signed-in users.
 */
export function JoinRoom({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const { token, hadFragment } = takeInviteToken(window.location.hash, window.sessionStorage);
    // Remove the token from the address bar and this history entry.
    if (hadFragment) window.history.replaceState(null, "", window.location.pathname);

    async function load() {
      if (!token) return setState({ kind: hadFragment ? "invalid" : "missing" });
      if (!signedIn) return setState({ kind: "guest" });
      const res = await postJson<Preview>("/api/rooms/join/preview", { token });
      if (cancelled) return;
      if (res.ok) return setState({ kind: "preview", token, preview: res.data });
      if (res.status === 404 || res.status === 400) {
        clearInviteToken(window.sessionStorage);
        return setState({ kind: "invalid" });
      }
      if (res.status === 401) return setState({ kind: "guest" });
      setState({ kind: "error", message: res.error, token });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  async function join(token: string) {
    setJoining(true);
    const res = await postJson<{ roomId: string }>("/api/rooms/join", { token });
    if (res.ok) {
      clearInviteToken(window.sessionStorage);
      toast.success(state.kind === "preview" ? `You joined ${state.preview.name}` : "You joined the room");
      router.replace(`/rooms/${res.data.roomId}`);
      return;
    }
    setJoining(false);
    if (res.status === 404 || res.status === 400) {
      clearInviteToken(window.sessionStorage);
      setState({ kind: "invalid" });
    } else if (res.status === 401) {
      setState({ kind: "guest" });
    } else {
      setState({ kind: "error", message: res.error, token });
    }
  }

  function cancel() {
    clearInviteToken(window.sessionStorage);
    router.push("/rooms");
  }

  return (
    <Card className="w-full max-w-[440px] shadow-sm" aria-busy={state.kind === "loading" || undefined}>
      {state.kind === "loading" && (
        <CardContent className="flex flex-col gap-3" aria-label="Loading invite">
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-16 w-full" />
          <span className="sr-only">Loading…</span>
        </CardContent>
      )}

      {(state.kind === "invalid" || state.kind === "missing") && (
        <>
          <CardHeader>
            <h1 className="font-heading text-[1.75rem]/9 font-semibold">Join a room</h1>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Alert variant="danger" role="alert">
              <CircleAlertIcon aria-hidden />
              <AlertTitle>
                {state.kind === "invalid" ? INVALID_LINK_COPY : "Open the invite link you received to join a room."}
              </AlertTitle>
            </Alert>
            <Link href="/rooms" className={buttonVariants({ variant: "secondary", className: "self-start" })}>
              Go to my rooms
            </Link>
          </CardContent>
        </>
      )}

      {state.kind === "guest" && (
        <>
          <CardHeader>
            <h1 className="font-heading text-[1.75rem]/9 font-semibold">You&apos;re invited to a room</h1>
            <p className="text-[0.9375rem] text-muted-foreground">
              Log in or create a free account to see the room and join it. Your invite is kept in this tab.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            <Link href={`/login?next=${NEXT}`} className={buttonVariants({ className: "sm:flex-1" })}>
              <LogInIcon aria-hidden />
              Log in
            </Link>
            <Link href={`/register?next=${NEXT}`} className={buttonVariants({ variant: "secondary", className: "sm:flex-1" })}>
              <UserPlusIcon aria-hidden />
              Sign up
            </Link>
          </CardContent>
        </>
      )}

      {state.kind === "preview" && (
        <>
          <CardHeader>
            <p className="eyebrow text-muted-foreground">Room invite</p>
            <h1 className="font-heading text-[1.75rem]/9 font-semibold break-words">
              {state.preview.alreadyMember ? state.preview.name : `Join ${state.preview.name}?`}
            </h1>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {state.preview.memberNames.map((n) => (
                  <Avatar key={n} name={n} className="ring-2 ring-card" />
                ))}
              </div>
              <p className="min-w-0 text-sm text-foreground-secondary">
                <UsersIcon aria-hidden className="mr-1 inline size-4 align-[-3px] text-muted-foreground" />
                {state.preview.memberCount} {state.preview.memberCount === 1 ? "member" : "members"}:{" "}
                {state.preview.memberNames.join(", ")}
                {state.preview.memberCount > state.preview.memberNames.length &&
                  ` and ${state.preview.memberCount - state.preview.memberNames.length} more`}
              </p>
            </div>
            {state.preview.alreadyMember ? (
              <Alert variant="info">
                <InfoIcon aria-hidden />
                <AlertTitle>You are already a member of this room.</AlertTitle>
              </Alert>
            ) : (
              state.preview.shareSolutions && (
                <Alert variant="info">
                  <InfoIcon aria-hidden />
                  <AlertDescription>
                    Accepted solutions in this room are visible to members after each session ends. You can turn
                    this off for yourself in the room&apos;s Members tab.
                  </AlertDescription>
                </Alert>
              )
            )}
          </CardContent>
          <CardFooter className="justify-end gap-2">
            {state.preview.alreadyMember && state.preview.roomId ? (
              <Link href={`/rooms/${state.preview.roomId}`} className={buttonVariants()}>
                Open room
              </Link>
            ) : (
              <>
                <Button variant="secondary" onClick={cancel} disabled={joining}>
                  Cancel
                </Button>
                <Button onClick={() => join(state.token)} loading={joining}>
                  {joining ? "Joining…" : "Join room"}
                </Button>
              </>
            )}
          </CardFooter>
        </>
      )}

      {state.kind === "error" && (
        <>
          <CardHeader>
            <h1 className="font-heading text-[1.75rem]/9 font-semibold">Join a room</h1>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Alert variant="warning" role="alert">
              <CircleAlertIcon aria-hidden />
              <AlertTitle>{state.message}</AlertTitle>
            </Alert>
            <div className="flex gap-2">
              <Link href="/rooms" className={buttonVariants({ variant: "secondary" })}>
                Go to my rooms
              </Link>
            </div>
          </CardContent>
        </>
      )}
    </Card>
  );
}
