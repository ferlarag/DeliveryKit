import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Endpoint } from "@/lib/api";

export function DestinationChoices({
  destinations,
  selectedIds,
  onChange,
  disabled = false,
}: {
  destinations: Endpoint[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const allSelected =
    destinations.length > 0 && destinations.every((item) => selectedIds.includes(item.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Forward to</span>
        {destinations.length > 0 && !allSelected && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={disabled}
            onClick={() => onChange(destinations.map((item) => item.id))}
          >
            Select all
          </Button>
        )}
      </div>
      {destinations.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          No destinations are registered yet.{" "}
          <Link to="/destinations" className="text-primary underline-offset-4 hover:underline">
            Add a destination
          </Link>{" "}
          first.
        </p>
      ) : (
        <div className="space-y-2">
          {destinations.map((destination) => (
            <label
              key={destination.id}
              className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm hover:bg-muted/30"
            >
              <Checkbox
                checked={selectedIds.includes(destination.id)}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onChange(
                    checked
                      ? [...selectedIds, destination.id]
                      : selectedIds.filter((id) => id !== destination.id),
                  )
                }
                aria-label={`Forward to ${destination.url}`}
              />
              <span className="min-w-0 break-all">{destination.url}</span>
            </label>
          ))}
        </div>
      )}
      {selectedIds.length === 0 && (
        <p className="text-xs text-destructive">Select at least one destination.</p>
      )}
    </div>
  );
}
