import { CopyableText } from "@/components/copyable-text";
import { webhookUrlFor } from "@/lib/webhook-url";

export function IncomingEndpointId({ id, className }: { id: string; className?: string }) {
  return (
    <CopyableText
      value={webhookUrlFor(id)}
      displayValue={`/${id}`}
      label="full URL"
      copiedLabel="Copied URL"
      ariaLabel={`Copy full webhook URL for /${id}`}
      className={className}
    />
  );
}
