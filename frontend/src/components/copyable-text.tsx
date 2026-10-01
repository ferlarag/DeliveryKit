import { RiCheckLine, RiFileCopyLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function CopyableText({
  value,
  displayValue,
  label,
  copiedLabel = "Copied",
  ariaLabel,
  className,
}: {
  value: string;
  displayValue: string;
  label: string;
  copiedLabel?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const timeout = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timeout.current !== null) window.clearTimeout(timeout.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
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
            onClick={copy}
            aria-label={ariaLabel ?? `Copy ${label}`}
            className={cn(
              "group inline-flex max-w-full items-center gap-2 rounded-md text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              className,
            )}
          />
        }
      >
        <span className="min-w-0 truncate">{displayValue}</span>
        {copyState === "copied" ? (
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-green-700 dark:text-green-300">
            <RiCheckLine className="size-4" /> {copiedLabel}
          </span>
        ) : copyState === "error" ? (
          <span className="shrink-0 text-xs text-destructive">Copy failed</span>
        ) : (
          <RiFileCopyLine className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        )}
      </TooltipTrigger>
      <TooltipContent>
        {copyState === "copied"
          ? `Copied ${label}`
          : copyState === "error"
            ? "Copy failed; try again"
            : `Click to copy ${label}`}
      </TooltipContent>
      <span className="sr-only" role="status">
        {copyState === "copied"
          ? `${label} copied`
          : copyState === "error"
            ? `Could not copy ${label}`
            : ""}
      </span>
    </Tooltip>
  );
}
