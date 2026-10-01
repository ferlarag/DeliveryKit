import { RiAddLine, RiCloseLine, RiRefreshLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DeliveryStatus } from "@/components/delivery-status";
import { CopyableText } from "@/components/copyable-text";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type DeliveryFilters, type DeliveryPage } from "@/lib/api";
import { useAdminToken } from "@/lib/use-admin-token";

type FilterDraft = Record<keyof Required<DeliveryFilters>, string>;
const emptyFilters: FilterDraft = {
  deliveryId: "",
  eventId: "",
  destination: "",
  status: "",
  attemptsMin: "",
  attemptsMax: "",
  createdFrom: "",
  createdBefore: "",
  updatedFrom: "",
  updatedBefore: "",
};
const deliveryIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const filterOptions: {
  key: keyof FilterDraft;
  label: string;
  type: "text" | "number" | "datetime-local" | "status";
  placeholder?: string;
}[] = [
  { key: "deliveryId", label: "Delivery ID", type: "text", placeholder: "Delivery UUID" },
  { key: "eventId", label: "Event ID contains", type: "text", placeholder: "e.g. order" },
  {
    key: "destination",
    label: "Destination URL or ID",
    type: "text",
    placeholder: "e.g. billing.example.com",
  },
  { key: "status", label: "Status", type: "status" },
  { key: "attemptsMin", label: "Attempts, at least", type: "number" },
  { key: "attemptsMax", label: "Attempts, at most", type: "number" },
  { key: "createdFrom", label: "Created from", type: "datetime-local" },
  { key: "createdBefore", label: "Created before", type: "datetime-local" },
  { key: "updatedFrom", label: "Updated from", type: "datetime-local" },
  { key: "updatedBefore", label: "Updated before", type: "datetime-local" },
];

function formatTime(value: string) {
  return new Date(value).toLocaleString();
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : "";
}

function toApiFilters(values: FilterDraft): DeliveryFilters {
  return {
    ...values,
    createdFrom: toIso(values.createdFrom),
    createdBefore: toIso(values.createdBefore),
    updatedFrom: toIso(values.updatedFrom),
    updatedBefore: toIso(values.updatedBefore),
  };
}

function validateFilters(values: FilterDraft): string | null {
  if (values.deliveryId && !deliveryIdPattern.test(values.deliveryId))
    return "Enter a valid delivery UUID.";
  if (values.eventId.length > 200) return "Event ID must be 200 characters or fewer.";
  if (values.destination.length > 2048) return "Destination must be 2048 characters or fewer.";
  const min = values.attemptsMin ? Number(values.attemptsMin) : null;
  const max = values.attemptsMax ? Number(values.attemptsMax) : null;
  if (
    (min !== null && (!Number.isInteger(min) || min < 0)) ||
    (max !== null && (!Number.isInteger(max) || max < 0)) ||
    (min !== null && max !== null && min > max)
  )
    return "Use nonnegative whole numbers, with minimum attempts no greater than maximum attempts.";
  for (const [from, before] of [
    [values.createdFrom, values.createdBefore],
    [values.updatedFrom, values.updatedBefore],
  ]) {
    if (
      (from && Number.isNaN(new Date(from).getTime())) ||
      (before && Number.isNaN(new Date(before).getTime())) ||
      (from && before && new Date(from) >= new Date(before))
    )
      return "Each time range must end after it starts.";
  }
  return null;
}

export function DeliveriesPage() {
  const token = useAdminToken();
  const [filters, setFilters] = useState<FilterDraft>({ ...emptyFilters });
  const [applied, setApplied] = useState<DeliveryFilters>({});
  const [editingFilter, setEditingFilter] = useState<keyof FilterDraft | null>(null);
  const [pendingValue, setPendingValue] = useState("");
  const [filterError, setFilterError] = useState<string | null>(null);
  const [result, setResult] = useState<DeliveryPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    if (!token) {
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }
    setResult(null);
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      api
        .deliveries(token, applied, page, size)
        .then(
          (data) => {
            if (active) setResult(data);
          },
          (cause) => {
            if (active)
              setError(cause instanceof Error ? cause.message : "Could not load deliveries.");
          },
        )
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [token, applied, page, size, refreshKey]);

  function openFilter(key: keyof FilterDraft) {
    setEditingFilter(key);
    setPendingValue("");
    setFilterError(null);
  }

  function addFilter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingFilter) return;
    const value = pendingValue.trim();
    if (!value) {
      setFilterError("Enter a value to add this filter.");
      return;
    }
    const values = { ...filters, [editingFilter]: value };
    const validationError = validateFilters(values);
    if (validationError) {
      setFilterError(validationError);
      return;
    }
    setFilterError(null);
    setFilters(values);
    setApplied(toApiFilters(values));
    setPage(0);
    setEditingFilter(null);
  }

  function removeFilter(key: keyof FilterDraft) {
    const values = { ...filters, [key]: "" };
    setFilters(values);
    setApplied(toApiFilters(values));
    setPage(0);
  }

  const activeOptions = filterOptions.filter(({ key }) => filters[key]);
  const availableOptions = filterOptions.filter(({ key }) => !filters[key]);
  const currentOption = filterOptions.find(({ key }) => key === editingFilter);

  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / size));
  const firstItem = result && result.total > 0 ? page * size + 1 : 0;
  const lastItem = result ? Math.min((page + 1) * size, result.total) : 0;

  return (
    <div className="space-y-8">
      <div>
        <Badge variant="secondary" className="mb-4">
          Activity
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Deliveries</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Browse every delivery, narrow the list with multiple filters, and open a delivery to
          inspect or retry it.
        </p>
      </div>

      <Dialog
        open={editingFilter !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingFilter(null);
            setFilterError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {currentOption?.label} filter</DialogTitle>
            <DialogDescription>
              {currentOption?.type === "datetime-local"
                ? "Use your local timezone. From is inclusive; before is exclusive."
                : currentOption?.key === "eventId"
                  ? "Match deliveries whose event ID contains this text."
                  : currentOption?.key === "destination"
                    ? "Match a destination URL or ID."
                    : "This filter will combine with your existing filters."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addFilter} className="space-y-5">
            <Field>
              <FieldLabel htmlFor="filter-value">{currentOption?.label}</FieldLabel>
              {currentOption?.type === "status" ? (
                <Select
                  value={pendingValue || null}
                  onValueChange={(value) => {
                    setPendingValue(value ?? "");
                    setFilterError(null);
                  }}
                >
                  <SelectTrigger id="filter-value" className="w-full">
                    <SelectValue placeholder="Choose a status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="PROCESSING">Processing</SelectItem>
                    <SelectItem value="FAILED">Failed</SelectItem>
                    <SelectItem value="SUCCEEDED">Succeeded</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="filter-value"
                  type={currentOption?.type ?? "text"}
                  min={currentOption?.type === "number" ? 0 : undefined}
                  step={currentOption?.type === "number" ? 1 : undefined}
                  placeholder={currentOption?.placeholder}
                  value={pendingValue}
                  onChange={(event) => {
                    setPendingValue(event.target.value);
                    setFilterError(null);
                  }}
                  autoFocus
                />
              )}
              {filterError && <FieldError>{filterError}</FieldError>}
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingFilter(null)}>
                Cancel
              </Button>
              <Button type="submit">Add filter</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="space-y-1.5">
            <CardTitle>All deliveries</CardTitle>
            <CardDescription>
              {result
                ? `${result.total.toLocaleString()} matching deliveries`
                : "Newest created first"}
            </CardDescription>
          </div>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              disabled={!token || loading}
              onClick={() => setRefreshKey((current) => current + 1)}
            >
              <RiRefreshLine /> Refresh
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 border-b pb-5">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    disabled={availableOptions.length === 0}
                  />
                }
              >
                <RiAddLine /> Add filter
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {availableOptions.map((option) => (
                  <DropdownMenuItem key={option.key} onClick={() => openFilter(option.key)}>
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {activeOptions.map((option) => (
              <Button
                key={option.key}
                type="button"
                variant="secondary"
                size="sm"
                className="h-auto max-w-full gap-2 rounded-full py-1.5"
                onClick={() => removeFilter(option.key)}
                aria-label={`Remove ${option.label} filter`}
                title="Click to remove filter"
              >
                <span className="max-w-64 truncate">
                  {option.label}:{" "}
                  {option.type === "datetime-local"
                    ? formatTime(filters[option.key])
                    : filters[option.key]}
                </span>
                <RiCloseLine className="size-3.5 shrink-0" />
              </Button>
            ))}
          </div>
          {!token ? (
            <p className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
              Enter the admin token in the header to list deliveries.
            </p>
          ) : loading ? (
            <div className="space-y-3">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-4/5" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertTitle>Could not load deliveries</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : result?.items.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
              No deliveries match these filters.
            </p>
          ) : result ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44 min-w-44 max-w-44">Delivery</TableHead>
                  <TableHead className="w-44 min-w-44 max-w-44">Event ID</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="sticky right-0 z-20 w-24 border-l bg-card text-right">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((delivery) => (
                  <TableRow key={delivery.id} className="group/row hover:bg-muted">
                    <TableCell className="w-44 min-w-44 max-w-44 text-sm">
                      <CopyableText
                        value={delivery.id}
                        displayValue={delivery.id}
                        label="delivery ID"
                        className="w-full min-w-0"
                      />
                    </TableCell>
                    <TableCell className="w-44 min-w-44 max-w-44">
                      <CopyableText
                        value={delivery.eventId}
                        displayValue={delivery.eventId}
                        label="event ID"
                        className="w-full min-w-0"
                      />
                    </TableCell>
                    <TableCell className="max-w-64 truncate" title={delivery.targetUrl}>
                      {delivery.targetUrl}
                    </TableCell>
                    <TableCell>
                      <DeliveryStatus status={delivery.status} />
                    </TableCell>
                    <TableCell>{delivery.attempts}</TableCell>
                    <TableCell className="text-xs" title={delivery.createdAt}>
                      {formatTime(delivery.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs" title={delivery.updatedAt}>
                      {formatTime(delivery.updatedAt)}
                    </TableCell>
                    <TableCell className="sticky right-0 z-10 w-24 border-l bg-card text-right transition-colors group-hover/row:bg-muted">
                      <Link
                        to="/deliveries/$deliveryId"
                        params={{ deliveryId: delivery.id }}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          {result && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
              <span className="text-muted-foreground">
                Showing {firstItem.toLocaleString()}–{lastItem.toLocaleString()} of{" "}
                {result.total.toLocaleString()}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Rows per page</span>
                <Select
                  value={String(size)}
                  onValueChange={(value) => {
                    if (value) {
                      setSize(Number(value));
                      setPage(0);
                    }
                  }}
                >
                  <SelectTrigger className="w-20" aria-label="Rows per page">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0 || loading}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </Button>
                <span className="min-w-16 text-center">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page + 1 >= totalPages || loading}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
