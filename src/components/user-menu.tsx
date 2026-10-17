"use client";

import { ChevronDownIcon, HistoryIcon, LoaderCircleIcon, LogOutIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** POST /api/auth/logout, then refresh server components. */
export function useLogout() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      setPending(false);
      router.refresh();
    }
  }

  return { logout, pending };
}

export function UserMenu({ username }: { username: string }) {
  const { logout, pending } = useLogout();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="header"
            className="gap-2 px-1.5 sm:px-2"
            aria-label={`Account menu for ${username}`}
          />
        }
      >
        <Avatar name={username} />
        <span className="hidden max-w-32 truncate sm:inline">{username}</span>
        <ChevronDownIcon
          aria-hidden
          className="hidden size-3.5! transition-transform duration-180 ease-out group-aria-expanded/button:rotate-180 sm:block"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <div className="px-2 py-2">
            <p className="truncate text-sm font-semibold text-foreground">{username}</p>
            <p className="text-xs text-muted-foreground">Signed in</p>
          </div>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={`/u/${username}`} />}>
          <UserIcon aria-hidden className="text-muted-foreground" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/submissions" />}>
          <HistoryIcon aria-hidden className="text-muted-foreground" />
          Submissions
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending} onClick={logout}>
          {pending ? (
            <LoaderCircleIcon aria-hidden className="animate-spin-slow text-muted-foreground" />
          ) : (
            <LogOutIcon aria-hidden className="text-muted-foreground" />
          )}
          {pending ? "Logging out…" : "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
