import { RiCheckLine, RiFileCopyLine } from "@remixicon/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyBlock({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-muted/40">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button variant="ghost" size="xs" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <RiCheckLine /> : <RiFileCopyLine />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="whitespace-pre-wrap break-all px-4 py-3 text-xs leading-relaxed">
        <code>{value}</code>
      </pre>
    </div>
  );
}
