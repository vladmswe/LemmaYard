"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { postJson, type ApiResult } from "./room-api";

/**
 * POST a room action, toast the outcome, refresh the server components on
 * success. Errors are toasted unless the caller handles them (returns the result).
 */
export function useRoomAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run<T = Record<string, unknown>>(
    path: string,
    body: unknown,
    options: { success?: string; refresh?: boolean; toastErrors?: boolean } = {},
  ): Promise<ApiResult<T>> {
    setPending(true);
    const result = await postJson<T>(path, body);
    setPending(false);
    if (result.ok) {
      if (options.success) toast.success(options.success);
      if (options.refresh !== false) router.refresh();
    } else if (options.toastErrors !== false) {
      toast.error(result.error);
    }
    return result;
  }

  return { run, pending };
}
