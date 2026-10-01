import { Badge } from "@/components/ui/badge";

export function IncomingEndpointStatus({ archived }: { archived: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        archived
          ? "border-yellow-300 bg-yellow-100 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-300"
          : "border-green-300 bg-green-100 text-green-800 dark:border-green-700 dark:bg-green-950/60 dark:text-green-300"
      }
    >
      {archived ? "Archived" : "Active"}
    </Badge>
  );
}
