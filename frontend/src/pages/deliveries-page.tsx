import { RiArrowRightLine, RiInformationLine, RiRefreshLine, RiSearchLine } from "@remixicon/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DeliveryStatus } from "@/components/delivery-status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type Delivery } from "@/lib/api";
import {
  isDeliveryId,
  parseDemoDeliveryIds,
  trackDeliveryIds,
  trackedDeliveryIds,
} from "@/lib/delivery-tracking";

type Row = { id: string; delivery?: Delivery; error?: string };

export function DeliveriesPage() {
  const navigate = useNavigate();
  const [ids, setIds] = useState(trackedDeliveryIds);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookupId, setLookupId] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (ids.length === 0) {
      setRows([]);
      return;
    }
    setLoading(true);
    Promise.all(
      ids.map(async (id): Promise<Row> => {
        try {
          return { id, delivery: await api.delivery(id) };
        } catch (cause) {
          return {
            id,
            error: cause instanceof Error ? cause.message : "Could not load this delivery.",
          };
        }
      }),
    )
      .then((result) => {
        if (active) setRows(result);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ids, refreshKey]);

  async function lookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = lookupId.trim();
    if (!isDeliveryId(id)) {
      setLookupError("Enter a valid delivery UUID.");
      return;
    }
    setLookupBusy(true);
    setLookupError(null);
    try {
      await api.delivery(id);
      setIds(trackDeliveryIds([id]));
      await navigate({ to: "/deliveries/$deliveryId", params: { deliveryId: id } });
    } catch (cause) {
      setLookupError(cause instanceof Error ? cause.message : "Could not find this delivery.");
    } finally {
      setLookupBusy(false);
    }
  }

  async function importDemoIds(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportMessage(null);
    setImportError(null);
    try {
      if (file.size > 32_768) throw new Error("This file is too large for a demo ID list.");
      const imported = parseDemoDeliveryIds(await file.text());
      setIds(trackDeliveryIds(imported));
      setImportMessage(`Imported ${imported.length} demo delivery IDs. Statuses are fetched live.`);
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : "Could not read this file.");
    } finally {
      event.target.value = "";
    }
  }

  const query = filter.trim().toLowerCase();
  const visible = rows.filter(
    ({ id, delivery }) =>
      !query ||
      [id, delivery?.eventId, delivery?.targetUrl, delivery?.status].some((value) =>
        value?.toLowerCase().includes(query),
      ),
  );

  return (
    <div className="space-y-8">
      <div>
        <Badge variant="secondary" className="mb-4">
          Activity
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Deliveries</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Check delivery status, inspect payloads, and open failed deliveries for a manual retry.
        </p>
      </div>

      <Alert>
        <RiInformationLine />
        <AlertTitle>Tracked in this browser</AlertTitle>
        <AlertDescription>
          The API does not provide a delivery list. This table contains up to 100 IDs created or
          opened in this browser; each row&apos;s status is fetched live. Events posted directly by
          third parties will not appear unless you enter a delivery ID.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Open a delivery</CardTitle>
          <CardDescription>
            Use any delivery ID, including one received outside this browser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={lookup} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field className="max-w-lg">
              <FieldLabel htmlFor="lookup-id">Delivery ID</FieldLabel>
              <Input
                id="lookup-id"
                placeholder="00000000-0000-0000-0000-000000000000"
                value={lookupId}
                onChange={(event) => setLookupId(event.target.value)}
                aria-invalid={!!lookupError}
              />
              {lookupError && <FieldError>{lookupError}</FieldError>}
            </Field>
            <Button type="submit" disabled={lookupBusy}>
              <RiSearchLine />
              {lookupBusy ? "Looking up…" : "Look up"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Load demo deliveries</CardTitle>
          <CardDescription>
            After running the local seed script, select its generated demo-delivery-ids.json file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field className="max-w-lg">
            <FieldLabel htmlFor="demo-ids-file">Demo ID file</FieldLabel>
            <Input
              id="demo-ids-file"
              type="file"
              accept=".json,application/json"
              onChange={importDemoIds}
              aria-invalid={!!importError}
            />
            {importError && <FieldError>{importError}</FieldError>}
            {importMessage && <p className="text-sm text-muted-foreground">{importMessage}</p>}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="space-y-1.5">
            <CardTitle>Recent tracked deliveries</CardTitle>
            <CardDescription>
              {ids.length} saved {ids.length === 1 ? "ID" : "IDs"} in this browser
            </CardDescription>
          </div>
          <CardAction className="col-start-1 row-span-1 row-start-3 justify-self-start sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:justify-self-end">
            <div className="flex gap-2">
              <Input
                aria-label="Filter deliveries"
                placeholder="Filter rows"
                className="w-40 sm:w-52"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
              <Button
                variant="outline"
                size="icon"
                aria-label="Refresh deliveries"
                disabled={loading || ids.length === 0}
                onClick={() => setRefreshKey((current) => current + 1)}
              >
                <RiRefreshLine />
              </Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-4/5" />
            </div>
          ) : ids.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
              No tracked deliveries yet. Send an event or look up a delivery ID to start this list.
            </p>
          ) : visible.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
              No tracked deliveries match that filter.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Event ID</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(({ id, delivery, error }) => (
                  <TableRow key={id}>
                    <TableCell className="font-mono text-xs">{id.slice(0, 8)}…</TableCell>
                    <TableCell className="max-w-44 truncate" title={delivery?.eventId}>
                      {delivery?.eventId ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-64 truncate" title={delivery?.targetUrl}>
                      {delivery?.targetUrl ?? "—"}
                    </TableCell>
                    <TableCell>
                      {delivery ? (
                        <DeliveryStatus status={delivery.status} />
                      ) : (
                        <span className="text-destructive" title={error}>
                          Unavailable
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{delivery?.attempts ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Link
                        to="/deliveries/$deliveryId"
                        params={{ deliveryId: id }}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        Details <RiArrowRightLine className="size-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
