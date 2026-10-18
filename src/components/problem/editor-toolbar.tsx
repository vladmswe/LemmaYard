"use client";

import { CloudUploadIcon, PlayIcon, RotateCcwIcon } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { cn } from "cn";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Kbd, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LANGUAGES, type Language } from "@/lib/submission-dto";
import { LANGUAGE_LABELS } from "@/lib/workspace/languages";
import { isApplePlatform, shortcutKeys } from "@/lib/workspace/shortcuts";

const noopSubscribe = () => () => {};

/** True on macOS / iOS (⌘ in hints); false on the server. */
export function useApplePlatform(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => isApplePlatform(navigator.platform || navigator.userAgent),
    () => false,
  );
}

export function ShortcutKeys({ action }: { action: "run" | "submit" }) {
  const apple = useApplePlatform();
  return (
    <span className="inline-flex items-center gap-0.5">
      {shortcutKeys(action, apple).map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </span>
  );
}

export type RunSubmitProps = {
  busyAction: "run" | "submit" | null;
  disabled: boolean;
  /** Why Run is disabled (invalid custom input), shown in its tooltip. */
  runBlockedReason: string | null;
  /** Why both are disabled (no code execution on this deployment), shown in both tooltips. */
  unavailableReason: string | null;
  onRun: () => void;
  onSubmit: () => void;
  /** Mobile action bar: full-width default-size buttons. */
  variant?: "toolbar" | "bar";
};

/** Run (secondary) + Submit (primary) with the ∎ loader and shortcut tooltips (DESIGN.md §13.4). */
export function RunSubmitButtons({
  busyAction,
  disabled,
  runBlockedReason,
  unavailableReason,
  onRun,
  onSubmit,
  variant = "toolbar",
}: RunSubmitProps) {
  const bar = variant === "bar";
  const size = bar ? "default" : "sm";
  const runReason = unavailableReason ?? runBlockedReason;
  const runDisabled = disabled || runReason !== null;
  const submitDisabled = disabled || unavailableReason !== null;
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="secondary"
              size={size}
              data-testid={bar ? "run-button-mobile" : "run-button"}
              className={cn(
                bar ? "flex-1" : "after:absolute after:-inset-1",
                // Hover must reach the tooltip that says why Run is blocked.
                runReason !== null && "aria-disabled:pointer-events-auto",
              )}
              loading={busyAction === "run"}
              disabled={runDisabled}
              // Invalid custom input / no judge: stay focusable so the tooltip
              // with the reason is reachable by keyboard and hover.
              focusableWhenDisabled={runReason !== null}
              onClick={onRun}
            />
          }
        >
          <PlayIcon aria-hidden />
          {busyAction === "run" ? "Running…" : "Run"}
        </TooltipTrigger>
        <TooltipContent>
          {runReason ?? (
            <>
              Run · <ShortcutKeys action="run" />
            </>
          )}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size={size}
              data-testid={bar ? "submit-button-mobile" : "submit-button"}
              className={cn(
                bar ? "flex-1" : "after:absolute after:-inset-1",
                unavailableReason !== null && "aria-disabled:pointer-events-auto",
              )}
              loading={busyAction === "submit"}
              disabled={submitDisabled}
              focusableWhenDisabled={unavailableReason !== null}
              onClick={onSubmit}
            />
          }
        >
          <CloudUploadIcon aria-hidden />
          {busyAction === "submit" ? "Submitting…" : "Submit"}
        </TooltipTrigger>
        <TooltipContent>
          {unavailableReason ?? (
            <>
              Submit · <ShortcutKeys action="submit" />
            </>
          )}
        </TooltipContent>
      </Tooltip>
    </>
  );
}

export type EditorToolbarProps = RunSubmitProps & {
  language: Language;
  onLanguageChange: (language: Language) => void;
  onReset: () => void;
  /** Hide Run / Submit here (mobile: they live in the bottom action bar). */
  showRunSubmit: boolean;
};

export function EditorToolbar({
  language,
  onLanguageChange,
  onReset,
  showRunSubmit,
  ...runSubmit
}: EditorToolbarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <>
      <Select
        value={language}
        onValueChange={(value) => {
          if (value) onLanguageChange(value as Language);
        }}
        items={LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABELS[l] }))}
      >
        <SelectTrigger size="sm" aria-label="Language" data-testid="language-select" className="w-auto min-w-32 font-semibold">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LANGUAGES.map((l) => (
            <SelectItem key={l} value={l} data-testid={`language-option-${l}`}>
              {LANGUAGE_LABELS[l]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Reset code"
              className="text-muted-foreground hover:text-foreground"
              data-testid="reset-button"
              onClick={() => setConfirmOpen(true)}
            />
          }
        >
          <RotateCcwIcon aria-hidden />
        </TooltipTrigger>
        <TooltipContent>Restore the starter code</TooltipContent>
      </Tooltip>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to the starter code?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current {LANGUAGE_LABELS[language]} code for this problem will be replaced. This
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* First tabbable element: gets the initial focus (DESIGN.md §8.9). */}
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              data-testid="reset-confirm"
              onClick={() => {
                setConfirmOpen(false);
                onReset();
              }}
            >
              Reset code
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showRunSubmit && (
        <div className="ml-auto flex items-center gap-2">
          <RunSubmitButtons {...runSubmit} />
        </div>
      )}
    </>
  );
}
