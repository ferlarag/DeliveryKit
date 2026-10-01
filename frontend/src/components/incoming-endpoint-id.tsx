import { RiCheckLine, RiFileCopyLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { webhookUrlFor } from "@/lib/webhook-url";

export function IncomingEndpointId({ id, className }: { id: string; className?: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const timeout = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timeout.current !== null) window.clearTimeout(timeout.current);
    },
    [],
  );

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(webhookUrlFor(id));
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    if (timeout.current !== null) window.clearTimeout(timeout.current);
    timeout.current = window.setTimeout(() => setCopyState("idle"), 2500);
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={copyUrl}
            aria-label={`Copy full webhook URL for /${id}`}
            className={cn(
              "group inline-flex max-w-full items-center gap-2 rounded-md text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              className,
            )}
          />
        }
      >
        <span className="truncate">/{id}</span>
        {copyState === "copied" ? (
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-green-700 dark:text-green-300">
            <RiCheckLine className="size-4" /> Copied URL
          </span>
        ) : copyState === "error" ? (
          <span className="shrink-0 text-xs text-destructive">Copy failed</span>
        ) : (
          <RiFileCopyLine className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        )}
      </TooltipTrigger>
      <TooltipContent>
        {copyState === "copied"
          ? "Copied full URL"
          : copyState === "error"
            ? "Copy failed; try again"
            : "Click to copy full URL"}
      </TooltipContent>
      <span className="sr-only" role="status">
        {copyState === "copied"
          ? "Full webhook URL copied"
          : copyState === "error"
            ? "Could not copy the webhook URL"
            : ""}
      </span>
    </Tooltip>
  );
}
