import {
  RiAddLine,
  RiArrowRightLine,
  RiInformationLine,
  RiMore2Line,
  RiRefreshLine,
} from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
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
import { api, type Endpoint } from "@/lib/api";
import { useAdminToken } from "@/lib/use-admin-token";

function endpointError(value: string) {
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.hash
    ) {
      return "Enter an absolute HTTP or HTTPS URL without credentials or a fragment.";
    }
    if (value.length > 2048) return "URLs must be 2,048 characters or fewer.";
    return null;
  } catch {
    return "Enter a valid absolute URL, such as https://example.com/webhook.";
  }
}

export function DestinationsPage() {
  const token = useAdminToken();
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [url, setUrl] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Endpoint | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editSubmitted, setEditSubmitted] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Endpoint | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [restoreBusyId, setRestoreBusyId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const validation = submitted ? endpointError(url.trim()) : null;
  const editValidation = editSubmitted ? endpointError(editUrl.trim()) : null;
  const activeEndpoints = endpoints.filter((endpoint) => !endpoint.archivedAt);
  const archivedEndpoints = endpoints.filter((endpoint) => !!endpoint.archivedAt);

  useEffect(() => {
    let active = true;
    if (!token) {
      setEndpoints([]);
      setViewing(null);
      setRemoving(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      api
        .endpoints(token, true)
        .then(
          (data) => {
            if (active) setEndpoints(data);
          },
          (cause) => {
            if (active)
              setError(cause instanceof Error ? cause.message : "Could not load destinations.");
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

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setFormError(null);
    const cleaned = url.trim();
    if (endpointError(cleaned) || !token) return;
    setBusy(true);
    try {
      await api.addEndpoint(token, cleaned);
      setUrl("");
      setSubmitted(false);
      setRefreshKey((current) => current + 1);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not add destination.");
    } finally {
      setBusy(false);
    }
  }

  function viewDestination(endpoint: Endpoint) {
    setViewing(endpoint);
    setEditUrl(endpoint.url);
    setEditSubmitted(false);
    setEditError(null);
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEditSubmitted(true);
    setEditError(null);
    const cleaned = editUrl.trim();
    if (endpointError(cleaned) || !token || !viewing) return;
    setEditBusy(true);
    try {
      const updated = await api.updateEndpoint(token, viewing.id, cleaned);
      setEndpoints((current) =>
        current.map((endpoint) => (endpoint.id === updated.id ? updated : endpoint)),
      );
      setViewing(null);
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Could not update destination.");
    } finally {
      setEditBusy(false);
    }
  }

  async function removeDestination() {
    if (!token || !removing) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await api.removeEndpoint(token, removing.id);
      setRemoving(null);
      setRefreshKey((current) => current + 1);
    } catch (cause) {
      setRemoveError(cause instanceof Error ? cause.message : "Could not remove destination.");
    } finally {
      setRemoveBusy(false);
    }
  }

  async function restoreDestination(id: string) {
    if (!token) return;
    setRestoreBusyId(id);
    setRestoreError(null);
    try {
      const restored = await api.restoreEndpoint(token, id);
      setEndpoints((current) =>
        current.map((endpoint) => (endpoint.id === id ? restored : endpoint)),
      );
    } catch (cause) {
      setRestoreError(cause instanceof Error ? cause.message : "Could not restore destination.");
    } finally {
      setRestoreBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Badge variant="secondary" className="mb-4">
          Routing
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Destinations</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Register URLs that receive webhook deliveries. Edit a URL or remove a destination when it
          is no longer needed.
        </p>
      </div>

      <Alert>
        <RiInformationLine />
        <AlertTitle>Routing lives with incoming endpoints</AlertTitle>
        <AlertDescription>
          Incoming endpoints select destinations by ID. Editing a URL affects new deliveries. To
          remove a destination, first unassign it from incoming endpoints. Existing deliveries and
          retries keep their original URL.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
        <Card>
          <CardHeader>
            <div className="space-y-1.5">
              <CardTitle>Registered destinations</CardTitle>
              <CardDescription>
                URL changes apply to new deliveries. Existing deliveries keep their original target.
              </CardDescription>
            </div>
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
                Enter the admin token in the header to view destinations.
              </p>
            ) : loading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-2/3" />
              </div>
            ) : error ? (
              <Alert variant="destructive">
                <AlertTitle>Could not load destinations</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : activeEndpoints.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                No active destinations. Add or restore one to begin creating deliveries.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Destination URL</TableHead>
                    <TableHead className="text-right">ID</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeEndpoints.map((endpoint) => (
                    <TableRow key={endpoint.id}>
                      <TableCell className="max-w-md truncate font-medium" title={endpoint.url}>
                        {endpoint.url}
                      </TableCell>
                      <TableCell
                        className="text-right font-mono text-xs text-muted-foreground"
                        title={endpoint.id}
                      >
                        {endpoint.id.slice(0, 8)}…
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Actions for ${endpoint.url}`}
                              />
                            }
                          >
                            <RiMore2Line />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => viewDestination(endpoint)}>
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => {
                                setRemoving(endpoint);
                                setRemoveError(null);
                              }}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add a destination</CardTitle>
            <CardDescription>DeliveryKit POSTs each event payload to this URL.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={add} className="space-y-5">
              <Field data-invalid={!!validation}>
                <FieldLabel htmlFor="destination-url">Webhook URL</FieldLabel>
                <Input
                  id="destination-url"
                  type="url"
                  placeholder="https://example.com/webhook"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  aria-invalid={!!validation}
                  disabled={!token || busy}
                />
                <FieldDescription>
                  HTTPS is required unless the server permits HTTP targets for local testing.
                </FieldDescription>
                {validation && <FieldError>{validation}</FieldError>}
              </Field>
              <Button type="submit" disabled={!token || busy}>
                <RiAddLine />
                {busy ? "Adding…" : "Add destination"}
              </Button>
              {formError && (
                <Alert variant="destructive">
                  <AlertTitle>Destination was not added</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}
            </form>
          </CardContent>
        </Card>
      </div>

      {archivedEndpoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Removed destinations</CardTitle>
            <CardDescription>
              Preserved for delivery history. Restore one to make it available for new routing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {restoreError && (
              <Alert variant="destructive">
                <AlertTitle>Could not restore destination</AlertTitle>
                <AlertDescription>{restoreError}</AlertDescription>
              </Alert>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Destination URL</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {archivedEndpoints.map((endpoint) => (
                  <TableRow key={endpoint.id}>
                    <TableCell className="max-w-md truncate" title={endpoint.url}>
                      {endpoint.url}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!!restoreBusyId}
                        onClick={() => restoreDestination(endpoint.id)}
                      >
                        {restoreBusyId === endpoint.id ? "Restoring…" : "Restore"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={!!viewing}
        onOpenChange={(open) => {
          if (!open && !editBusy) setViewing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Destination details</DialogTitle>
            <DialogDescription>
              Update the URL for new deliveries. Existing deliveries keep their original target.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 text-sm">
            <span className="text-muted-foreground">Destination ID</span>
            <p className="break-all font-mono text-xs">{viewing?.id}</p>
          </div>
          <form onSubmit={saveEdit} className="space-y-5">
            <Field data-invalid={!!editValidation}>
              <FieldLabel htmlFor="edit-destination-url">Webhook URL</FieldLabel>
              <Input
                id="edit-destination-url"
                type="url"
                value={editUrl}
                onChange={(event) => setEditUrl(event.target.value)}
                aria-invalid={!!editValidation}
                disabled={editBusy}
              />
              {editValidation && <FieldError>{editValidation}</FieldError>}
            </Field>
            {editError && (
              <Alert variant="destructive">
                <AlertTitle>Destination was not updated</AlertTitle>
                <AlertDescription>{editError}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={editBusy}
                onClick={() => setViewing(null)}
              >
                Close
              </Button>
              <Button type="submit" disabled={editBusy || editUrl.trim() === viewing?.url}>
                {editBusy ? "Saving…" : "Save URL"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open && !removeBusy) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove destination?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.url} will stop receiving new deliveries. Its delivery history stays intact.
              You can restore it later. First unassign it from any incoming endpoints that use it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeError && (
            <Alert variant="destructive">
              <AlertTitle>Destination was not removed</AlertTitle>
              <AlertDescription>{removeError}</AlertDescription>
              <Link to="/" className="mt-2 inline-block text-sm underline">
                Manage incoming endpoints
              </Link>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removeBusy}
              onClick={removeDestination}
            >
              {removeBusy ? "Removing…" : "Remove destination"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card className="bg-muted/30">
        <CardContent className="flex flex-wrap items-center gap-3 py-5 text-sm">
          <Badge variant="outline">Current flow</Badge>
          <span>POST /webhooks/{"{endpointId}"}</span>
          <RiArrowRightLine className="size-4 text-muted-foreground" />
          <span>Queue deliveries for that endpoint&apos;s selected destinations</span>
        </CardContent>
      </Card>
    </div>
  );
}
