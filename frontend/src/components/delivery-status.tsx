import { Badge } from "@/components/ui/badge";

export function DeliveryStatus({ status }: { status: string }) {
  const variant =
    status === "FAILED" ? "destructive" : status === "SUCCEEDED" ? "secondary" : "outline";
  return <Badge variant={variant}>{status.toLowerCase()}</Badge>;
}
