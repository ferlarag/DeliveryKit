import { RiAddLine, RiRefreshLine } from "@remixicon/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DestinationChoices } from "@/components/destination-choices";
import { IncomingEndpointId } from "@/components/incoming-endpoint-id";
import { IncomingEndpointStatus } from "@/components/incoming-endpoint-status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
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
import { api, type Endpoint, type IngressEndpoint } from "@/lib/api";
import { useAdminToken } from "@/lib/use-admin-token";

const ingressIdPattern = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/;

function ingressIdError(value: string) {
  if (!value) return "Enter an endpoint ID or generate one.";
  if (!ingressIdPattern.test(value))
    return "Use 1–64 lowercase letters, numbers, hyphens, or underscores; start and end with a letter or number.";
  return null;
}

export function IncomingPage() {
  const token = useAdminToken();
  const navigate = useNavigate();
  const [endpoints, setEndpoints] = useState<IngressEndpoint[]>([]);
  const [destinations, setDestinations] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [baselineId, setBaselineId] = useState("");
  const [baselineDestinationIds, setBaselineDestinationIds] = useState<string[]>([]);
  const [newId, setNewId] = useState("");
  const [newDestinationIds, setNewDestinationIds] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!token) {
      setEndpoints([]);
      setDestinations([]);
      setLoading(false);
      setLoadError(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const timer = window.setTimeout(() => {
      Promise.all([api.ingressEndpoints(token), api.endpoints(token)])
        .then(
          ([data, targets]) => {
            if (!active) return;
            setEndpoints(data);
            setDestinations(targets);
          },
          (cause) => {
            if (active)
              setLoadError(
                cause instanceof Error ? cause.message : "Could not load incoming endpoints.",
              );
          },
        )
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 400);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [token, refreshKey]);

  const dirty =
    newId !== baselineId ||
    newDestinationIds.length !== baselineDestinationIds.length ||
    newDestinationIds.some((id) => !baselineDestinationIds.includes(id));

  function openCreate() {
    const id = crypto.randomUUID();
    const ids = destinations.map((destination) => destination.id);
    setBaselineId(id);
    setBaselineDestinationIds(ids);
    setNewId(id);
    setNewDestinationIds(ids);
    setSubmitted(false);
    setFormError(null);
    setCreateOpen(true);
  }

  function requestClose() {
    if (creating) return;
    if (dirty) setDiscardOpen(true);
    else setCreateOpen(false);
  }

  async function createEndpoint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setFormError(null);
    const id = newId.trim();
    if (ingressIdError(id) || !token || newDestinationIds.length === 0) return;
    setCreating(true);
    try {
      const created = await api.addIngressEndpoint(token, id, newDestinationIds);
      setCreateOpen(false);
      await navigate({ to: "/incoming/$endpointId", params: { endpointId: created.id } });
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not create the endpoint.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="secondary" className="mb-4">
            Incoming
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Incoming endpoints</h1>
          <p className="mt-3 text-muted-foreground">
            Manage where each incoming webhook is forwarded.
          </p>
        </div>
        <Button onClick={openCreate} disabled={!token || loading || !!loadError}>
          <RiAddLine /> Create endpoint
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Endpoints</CardTitle>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshKey((current) => current + 1)}
              disabled={!token || loading}
            >
              <RiRefreshLine /> Refresh
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!token ? (
            <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              Enter the admin token in the header to manage incoming endpoints.
            </p>
          ) : loading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : loadError ? (
            <Alert variant="destructive">
              <AlertTitle>Could not load incoming endpoints</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          ) : endpoints.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              No incoming endpoints yet. Create one to get a dedicated POST URL.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Endpoint ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Forwarding</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpoints.map((endpoint) => (
                  <TableRow key={endpoint.id}>
                    <TableCell className="max-w-56" title={endpoint.id}>
                      <IncomingEndpointId id={endpoint.id} className="font-medium" />
                    </TableCell>
                    <TableCell>
                      <IncomingEndpointStatus archived={!!endpoint.archivedAt} />
                    </TableCell>
                    <TableCell>
                      {endpoint.destinationIds.length} destination
                      {endpoint.destinationIds.length === 1 ? "" : "s"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        to="/incoming/$endpointId"
                        params={{ endpointId: endpoint.id }}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (open) openCreate();
          else requestClose();
        }}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create an endpoint</DialogTitle>
            <DialogDescription>
              Choose a reusable ID and the destinations for its events.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createEndpoint} className="space-y-5">
            <Field data-invalid={!!(submitted && ingressIdError(newId.trim()))}>
              <FieldLabel htmlFor="incoming-endpoint-id">Endpoint ID</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="incoming-endpoint-id"
                  value={newId}
                  onChange={(event) => setNewId(event.target.value)}
                  placeholder="orders-production"
                  maxLength={64}
                  disabled={creating}
                  aria-invalid={!!(submitted && ingressIdError(newId.trim()))}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setNewId(crypto.randomUUID());
                    setSubmitted(false);
                  }}
                  disabled={creating}
                  aria-label="Generate endpoint ID"
                >
                  <RiRefreshLine /> Generate
                </Button>
              </div>
              <FieldDescription>
                1–64 lowercase letters, numbers, hyphens, or underscores. IDs cannot be changed.
              </FieldDescription>
              {submitted && ingressIdError(newId.trim()) && (
                <FieldError>{ingressIdError(newId.trim())}</FieldError>
              )}
            </Field>
            <DestinationChoices
              destinations={destinations}
              selectedIds={newDestinationIds}
              onChange={setNewDestinationIds}
              disabled={creating}
            />
            {formError && (
              <Alert variant="destructive">
                <AlertTitle>Endpoint was not created</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={creating}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating || newDestinationIds.length === 0}>
                <RiAddLine /> {creating ? "Creating…" : "Create endpoint"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              The endpoint has not been created. Closing now will lose the changes you made.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setDiscardOpen(false);
                setCreateOpen(false);
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
