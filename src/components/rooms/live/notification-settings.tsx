"use client";

// Notification settings (docs/specs/rooms.md §3.5): a `Bell` icon button that
// opens a popover with switches stored per browser. The browser permission is
// requested only from the explicit "Enable browser notifications" click,
// never on page load; unsupported/denied states explain themselves.
import { BellIcon, BellOffIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { browserPermissionHelp, type BrowserPermission, type NotificationPrefs } from "@/lib/rooms/notifications";

import { browserPermission, primeSound, requestBrowserPermission } from "./alerts";
import { setNotificationPrefs, useNotificationPrefs } from "./use-notifications";

function SwitchRow({
  label,
  help,
  checked,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <Label htmlFor={id} id={`${id}-l`} className="cursor-pointer text-sm">
          {label}
        </Label>
        {help && (
          <p id={`${id}-h`} className="mt-0.5 text-xs text-muted-foreground">
            {help}
          </p>
        )}
      </div>
      <Switch
        id={id}
        data-testid={testId}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-labelledby={`${id}-l`}
        aria-describedby={help ? `${id}-h` : undefined}
        className="mt-0.5"
      />
    </div>
  );
}

export function NotificationSettings({ className, size = "icon" }: { className?: string; size?: "icon" | "icon-sm" }) {
  const prefs = useNotificationPrefs();
  const [permission, setPermission] = useState<BrowserPermission>("default");
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    // Read after mount (the server has no Notification API).
    queueMicrotask(() => setPermission(browserPermission()));
  }, []);

  const set = (patch: Partial<NotificationPrefs>) => setNotificationPrefs(patch);
  const muted = !prefs.toasts && !prefs.sound && !(prefs.browser && permission === "granted");

  async function enableBrowser() {
    setAsking(true);
    const result = await requestBrowserPermission();
    setAsking(false);
    setPermission(result);
    if (result === "granted") set({ browser: true });
  }

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size={size}
                  aria-label="Notification settings"
                  data-testid="notification-settings"
                  className={className}
                />
              }
            />
          }
        >
          {muted ? <BellOffIcon aria-hidden /> : <BellIcon aria-hidden />}
        </TooltipTrigger>
        <TooltipContent>Notification settings</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-[22rem]">
        <PopoverTitle>Notifications</PopoverTitle>
        <PopoverDescription className="mt-1">Saved in this browser. Only while this tab is open.</PopoverDescription>
        <div className="mt-2 divide-y">
          <SwitchRow
            label="Pop-up notifications"
            help="Short messages on the problem page when someone solves a problem."
            checked={prefs.toasts}
            onChange={(v) => set({ toasts: v })}
            testId="pref-toasts"
          />
          <SwitchRow
            label="Sound"
            help="A short tick when someone else solves a problem."
            checked={prefs.sound}
            onChange={(v) => {
              // The click is the user gesture browsers require before audio.
              if (v) primeSound();
              set({ sound: v });
            }}
            testId="pref-sound"
          />
          <SwitchRow
            label="Show failed attempts"
            help="Also announce when someone makes an attempt that did not pass."
            checked={prefs.showAttempts}
            onChange={(v) => set({ showAttempts: v })}
            testId="pref-attempts"
          />
          <div className="py-2">
            {permission === "granted" ? (
              <SwitchRow
                label="Browser notifications when this tab is in the background"
                help={browserPermissionHelp(permission)}
                checked={prefs.browser}
                onChange={(v) => set({ browser: v })}
                testId="pref-browser"
              />
            ) : (
              <div className="flex flex-col items-start gap-2 py-2">
                <p className="text-sm font-semibold text-foreground">Browser notifications</p>
                <p className={cn("text-xs", permission === "denied" ? "text-foreground-secondary" : "text-muted-foreground")}>
                  {permission === "default"
                    ? "Get a system notification when this tab is in the background. Notifications in background tabs may be delayed by up to a minute."
                    : browserPermissionHelp(permission)}
                </p>
                {permission === "default" && (
                  <Button variant="secondary" size="sm" loading={asking} onClick={enableBrowser} data-testid="enable-browser-notifications">
                    Enable browser notifications
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
