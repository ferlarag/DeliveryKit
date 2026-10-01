import { RiArrowLeftLine, RiArrowRightLine, RiRefreshLine } from "@remixicon/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CopyBlock } from "@/components/copy-block";
import { DestinationChoices } from "@/components/destination-choices";
import { IncomingEndpointId } from "@/components/incoming-endpoint-id";
import { IncomingEndpointStatus } from "@/components/incoming-endpoint-status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, type Endpoint, type EventResponse, type IngressEndpoint } from "@/lib/api";
import { useAdminToken } from "@/lib/use-admin-token";
import { webhookUrlFor } from "@/lib/webhook-url";

const eventIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
function eventIdError(value: string) {
  if (!value.trim()) return "Enter an event ID or generate one.";
  if (value.length > 200) return "Event IDs must be 200 characters or fewer.";
  if (!eventIdPattern.test(value))
    return "Use letters, numbers, dots, underscores, colons, or hyphens; start with a letter or number.";
  return null;
}
function parsePayload(value: string): { value?: unknown; error?: string } {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      return { error: "Use a JSON object for the payload." };
    if (JSON.stringify(parsed).length > 200_000)
      return { error: "The payload must be 200,000 characters or fewer when sent." };
    return { value: parsed };
  } catch {
    return { error: "Enter valid JSON before sending." };
  }
}
function sourceUrlError(value: string) {
  if (!value.trim()) return null;
  if (value.length > 2048) return "Source URLs must be 2,048 characters or fewer.";
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.hash
    )
      return "Enter an absolute HTTP or HTTPS URL without credentials or a fragment.";
    return null;
  } catch {
    return "Enter an absolute HTTP or HTTPS URL.";
  }
}

export function IncomingEndpointDetailPage({ id }: { id: string }) {
  const token = useAdminToken();
  const navigate = useNavigate();
  const [endpoint, setEndpoint] = useState<IngressEndpoint | null>(null);
  const [destinations, setDestinations] = useState<Endpoint[]>([]);
  const [routeDestinationIds, setRouteDestinationIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [eventId, setEventId] = useState<string>(() => crypto.randomUUID());
  const [payload, setPayload] = useState('{\n  "kind": "demo"\n}');
  const [sourceUrl, setSourceUrl] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EventResponse | null>(null);

  useEffect(() => {
    let active = true;
    if (!token) {
      setEndpoint(null);
      setDestinations([]);
      setLoadError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const timer = window.setTimeout(() => {
      Promise.all([api.ingressEndpoints(token), api.endpoints(token)])
        .then(
          ([all, targets]) => {
            if (!active) return;
            const found = all.find((item) => item.id === id) ?? null;
            setEndpoint(found);
            setDestinations(targets);
            setRouteDestinationIds(found?.destinationIds ?? []);
          },
          (cause) => {
            if (active)
              setLoadError(
                cause instanceof Error ? cause.message : "Could not load this endpoint.",
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
  }, [token, id, refreshKey]);

  const idError = submitted ? eventIdError(eventId) : null;
  const payloadResult = parsePayload(payload);
  const payloadError = submitted ? payloadResult.error : null;
  const sourceUrlValidation = sourceUrlError(sourceUrl.trim());
  const urlError = submitted ? sourceUrlValidation : null;
  const webhookUrl = webhookUrlFor(id);
  const requestBody = payloadResult.error
    ? "Fix the payload JSON to preview the request body."
    : JSON.stringify(
        {
          eventId,
          payload: payloadResult.value,
          ...(sourceUrl.trim() && { sourceUrl: sourceUrl.trim() }),
        },
        null,
        2,
      );

  async function saveRoutes() {
    if (!token || !endpoint) return;
    setSettingsBusy(true);
    setSettingsError(null);
    setSettingsMessage(null);
    try {
      const updated = await api.updateIngressDestinations(token, endpoint.id, routeDestinationIds);
      setEndpoint(updated);
      setSettingsMessage("Forwarding settings saved. New events will use these destinations.");
    } catch (cause) {
      setSettingsError(
        cause instanceof Error ? cause.message : "Could not save forwarding settings.",
      );
    } finally {
      setSettingsBusy(false);
    }
  }
  async function toggleArchive() {
    if (!token || !endpoint) return;
    setSettingsBusy(true);
    setSettingsError(null);
    setSettingsMessage(null);
    try {
      const updated = endpoint.archivedAt
        ? await api.restoreIngressEndpoint(token, endpoint.id)
        : await api.archiveIngressEndpoint(token, endpoint.id);
      setEndpoint(updated);
      setSettingsMessage(
        updated.archivedAt
          ? "Endpoint archived. Its URL no longer accepts events."
          : "Endpoint restored.",
      );
    } catch (cause) {
      setSettingsError(
        cause instanceof Error ? cause.message : "Could not change endpoint status.",
      );
    } finally {
      setSettingsBusy(false);
    }
  }
  async function deleteEndpoint() {
    if (!token || !endpoint) return;
    setSettingsBusy(true);
    setSettingsError(null);
    try {
      await api.deleteIngressEndpoint(token, endpoint.id);
      await navigate({ to: "/" });
    } catch (cause) {
      setSettingsError(cause instanceof Error ? cause.message : "Could not delete this endpoint.");
    } finally {
      setSettingsBusy(false);
    }
  }
  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setError(null);
    setResult(null);
    if (
      eventIdError(eventId) ||
      payloadResult.error ||
      sourceUrlValidation ||
      !endpoint ||
      endpoint.archivedAt
    )
      return;
    setBusy(true);
    try {
      const created = await api.submitEvent(
        eventId,
        payloadResult.value,
        sourceUrl.trim(),
        endpoint.id,
      );
      setResult(created);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit the event.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/"
          className={buttonVariants({ variant: "ghost", size: "sm", className: "mb-4 -ml-3" })}
        >
          <RiArrowLeftLine /> Incoming endpoints
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 text-3xl font-semibold tracking-tight sm:text-4xl">
            <IncomingEndpointId id={id} />
          </h1>
          {endpoint && <IncomingEndpointStatus archived={!!endpoint.archivedAt} />}
        </div>
        <p className="mt-3 text-muted-foreground">
          Configure forwarding and test this incoming endpoint.
        </p>
      </div>
      {!token ? (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Enter the admin token in the header to view this endpoint.
        </p>
      ) : loading ? (
        <div className="space-y-3">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load endpoint</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((current) => current + 1)}
            className="mt-3"
          >
            <RiRefreshLine /> Retry
          </Button>
        </Alert>
      ) : !endpoint ? (
        <Alert>
          <AlertTitle>Endpoint not found</AlertTitle>
          <AlertDescription>This endpoint may have been deleted.</AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Sender instructions</CardTitle>
              <CardDescription>
                Send a POST request with the JSON body and Content-Type: application/json.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CopyBlock label="POST URL" value={webhookUrl} />
              <CopyBlock label="JSON body" value={requestBody} />
              {endpoint.archivedAt && (
                <p className="text-sm text-destructive">
                  This endpoint is archived; its POST URL does not accept events.
                </p>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">
                Replace localhost with your deployed API hostname when sharing externally. The event
                ID must be unique for each new event. The endpoint ID is reusable.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Forwarding settings</CardTitle>
              <CardDescription>
                Routing changes apply to new events. Already queued deliveries keep their original
                destination.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <DestinationChoices
                destinations={destinations}
                selectedIds={routeDestinationIds}
                onChange={setRouteDestinationIds}
                disabled={settingsBusy}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={saveRoutes}
                  disabled={settingsBusy || routeDestinationIds.length === 0}
                >
                  {settingsBusy ? "Saving…" : "Save forwarding"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={toggleArchive}
                  disabled={settingsBusy}
                >
                  {endpoint.archivedAt ? "Restore endpoint" : "Archive endpoint"}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setConfirmDelete(true)}
                  disabled={settingsBusy}
                >
                  Delete endpoint
                </Button>
              </div>
              {confirmDelete && (
                <div className="space-y-3 rounded-xl border border-destructive/40 p-4 text-sm">
                  <p>
                    Permanently delete <strong>{endpoint.id}</strong>? Deletion is available only
                    before its first event. Archive it to keep its history.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={settingsBusy}
                      onClick={deleteEndpoint}
                    >
                      Confirm delete
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={settingsBusy}
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {settingsError && (
                <Alert variant="destructive">
                  <AlertTitle>Could not update endpoint</AlertTitle>
                  <AlertDescription>{settingsError}</AlertDescription>
                </Alert>
              )}
              {settingsMessage && (
                <Alert>
                  <AlertDescription>{settingsMessage}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Send a test event</CardTitle>
              <CardDescription>
                Sends through {endpoint.id} to {endpoint.destinationIds.length} selected
                destinations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={send} className="space-y-6">
                <Field data-invalid={!!idError}>
                  <FieldLabel htmlFor="event-id">Event ID</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="event-id"
                      value={eventId}
                      onChange={(event) => setEventId(event.target.value)}
                      aria-invalid={!!idError}
                      maxLength={200}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEventId(crypto.randomUUID());
                        setSubmitted(false);
                      }}
                      aria-label="Generate event ID"
                    >
                      <RiRefreshLine /> Generate
                    </Button>
                  </div>
                  <FieldDescription>
                    Generate a UUID or enter your own ID. Event IDs are unique across all incoming
                    endpoints.
                  </FieldDescription>
                  {idError && <FieldError>{idError}</FieldError>}
                </Field>
                <Field data-invalid={!!payloadError}>
                  <FieldLabel htmlFor="payload">Payload</FieldLabel>
                  <Textarea
                    id="payload"
                    className="min-h-44 font-mono text-sm"
                    value={payload}
                    onChange={(event) => setPayload(event.target.value)}
                    aria-invalid={!!payloadError}
                    spellCheck={false}
                  />
                  <FieldDescription>
                    Send a JSON object of up to 200,000 characters.
                  </FieldDescription>
                  {payloadError && <FieldError>{payloadError}</FieldError>}
                </Field>
                <Field data-invalid={!!urlError}>
                  <FieldLabel htmlFor="source-url">Source URL</FieldLabel>
                  <Input
                    id="source-url"
                    type="url"
                    placeholder="https://shop.example.com/events"
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    aria-invalid={!!urlError}
                  />
                  <FieldDescription>
                    Optional sender claim; not inferred from the request.
                  </FieldDescription>
                  {urlError && <FieldError>{urlError}</FieldError>}
                </Field>
                <Button type="submit" disabled={busy || !!endpoint.archivedAt}>
                  {busy ? "Sending…" : "Send event"}
                  <RiArrowRightLine data-icon="inline-end" />
                </Button>
                {endpoint.archivedAt && (
                  <p className="text-sm text-muted-foreground">
                    Restore this endpoint to send new events.
                  </p>
                )}
              </form>
              {error && (
                <Alert variant="destructive" className="mt-6">
                  <AlertTitle>Event was not sent</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {result && (
                <Alert className="mt-6">
                  <AlertTitle>Event accepted</AlertTitle>
                  <AlertDescription>
                    {result.deliveryIds.length === 0
                      ? "No deliveries were created because no destinations are registered."
                      : `${result.deliveryIds.length} delivery${result.deliveryIds.length === 1 ? "" : "ies"} created.`}
                    {result.deliveryIds.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1">
                        {result.deliveryIds.map((deliveryId) => (
                          <Link
                            key={deliveryId}
                            to="/deliveries/$deliveryId"
                            params={{ deliveryId }}
                            className="text-sm text-primary underline-offset-4 hover:underline"
                          >
                            {deliveryId}
                          </Link>
                        ))}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
