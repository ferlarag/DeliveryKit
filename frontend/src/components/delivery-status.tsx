import { Badge } from "@/components/ui/badge";

export function DeliveryStatus({ status }: { status: string }) {
  const color =
    status === "SUCCEEDED"
      ? "border-green-300 bg-green-100 text-green-800 dark:border-green-700 dark:bg-green-950/60 dark:text-green-300"
      : status === "FAILED"
        ? "border-red-300 bg-red-100 text-red-800 dark:border-red-700 dark:bg-red-950/60 dark:text-red-300"
        : "border-yellow-300 bg-yellow-100 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-300";
  return (
    <Badge variant="outline" className={color}>
      {status.toLowerCase()}
    </Badge>
  );
}
