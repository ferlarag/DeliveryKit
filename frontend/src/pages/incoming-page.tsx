import { RiAddLine, RiArrowRightLine, RiInformationLine, RiRefreshLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyBlock } from "@/components/copy-block";
import { api, type EventResponse, type IngressEndpoint } from "@/lib/api";
import { trackDeliveryIds } from "@/lib/delivery-tracking";
import { useAdminToken } from "@/lib/use-admin-token";

const ingressIdPattern = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/;

function ingressIdError(value: string) {
  if (!value) return "Enter an endpoint ID or generate one.";
  if (!ingressIdPattern.test(value))
    return "Use 1–64 lowercase letters, numbers, hyphens, or underscores; start and end with a letter or number.";
  return null;
}

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
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: "Use a JSON object for the payload." };
    }
    if (JSON.stringify(parsed).length > 200_000) {
      return { error: "The payload must be 200,000 characters or fewer when sent." };
    }
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
    ) {
      return "Enter an absolute HTTP or HTTPS URL without credentials or a fragment.";
    }
    return null;
  } catch {
    return "Enter an absolute HTTP or HTTPS URL.";
  }
}

export function IncomingPage() {
  const token = useAdminToken();
  const [ingressEndpoints, setIngressEndpoints] = useState<IngressEndpoint[]>([]);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const [newEndpointId, setNewEndpointId] = useState<string>(() => crypto.randomUUID());
  const [endpointSubmitted, setEndpointSubmitted] = useState(false);
  const [endpointBusy, setEndpointBusy] = useState(false);
  const [endpointLoading, setEndpointLoading] = useState(false);
  const [endpointLoadError, setEndpointLoadError] = useState<string | null>(null);
  const [endpointFormError, setEndpointFormError] = useState<string | null>(null);
  const [endpointRefreshKey, setEndpointRefreshKey] = useState(0);
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
      setIngressEndpoints([]);
      setSelectedEndpointId(null);
      setEndpointLoadError(null);
      setEndpointLoading(false);
      return;
    }
    setEndpointLoading(true);
    setEndpointLoadError(null);
    const timer = window.setTimeout(() => {
      api.ingressEndpoints(token)
        .then(
          (data) => {
            if (!active) return;
            setIngressEndpoints(data);
            setSelectedEndpointId((current) =>
              data.some((endpoint) => endpoint.id === current) ? current : (data[0]?.id ?? null),
            );
          },
          (cause) => {
            if (active)
              setEndpointLoadError(cause instanceof Error ? cause.message : "Could not load incoming endpoints.");
          },
        )
        .finally(() => {
          if (active) setEndpointLoading(false);
        });
    }, 400);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [token, endpointRefreshKey]);

  const idError = submitted ? eventIdError(eventId) : null;
  const payloadResult = parsePayload(payload);
  const payloadError = submitted ? payloadResult.error : null;
  const sourceUrlValidation = sourceUrlError(sourceUrl.trim());
  const urlError = submitted ? sourceUrlValidation : null;
  const apiOrigin =
    import.meta.env.VITE_API_ORIGIN ||
    (import.meta.env.DEV ? "http://localhost:8080" : window.location.origin);
  const webhookUrl = new URL(
    selectedEndpointId ? `/webhooks/${encodeURIComponent(selectedEndpointId)}` : "/webhooks",
    apiOrigin,
  ).toString();
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

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setError(null);
    setResult(null);
    if (eventIdError(eventId) || payloadResult.error || sourceUrlValidation) return;

    setBusy(true);
    try {
      const created = await api.submitEvent(
        eventId,
        payloadResult.value,
        sourceUrl.trim(),
        selectedEndpointId ?? undefined,
      );
      trackDeliveryIds(created.deliveryIds);
      setResult(created);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit the event.");
    } finally {
      setBusy(false);
    }
  }

  async function createEndpoint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEndpointSubmitted(true);
    setEndpointFormError(null);
    const id = newEndpointId.trim();
    if (ingressIdError(id) || !token) return;
    setEndpointBusy(true);
    try {
      const created = await api.addIngressEndpoint(token, id);
      setIngressEndpoints((current) => [...current, created]);
      setSelectedEndpointId(created.id);
      setNewEndpointId(crypto.randomUUID());
      setEndpointSubmitted(false);
    } catch (cause) {
      setEndpointFormError(cause instanceof Error ? cause.message : "Could not create the endpoint.");
    } finally {
      setEndpointBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Badge variant="secondary" className="mb-4">
          Incoming
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Incoming webhooks
        </h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Create a reusable incoming endpoint, copy its POST URL, and send a test event. Each event
          still needs its own unique event ID.
        </p>
      </div>

      <Alert>
        <RiInformationLine />
        <AlertTitle>Forwarding is global</AlertTitle>
        <AlertDescription>
          Each incoming endpoint has its own URL. Events from every endpoint currently go to every
          registered destination.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card>
          <CardHeader>
            <div className="space-y-1.5">
              <CardTitle>Incoming endpoints</CardTitle>
              <CardDescription>Select an endpoint to see its URL and send a test event.</CardDescription>
            </div>
            <CardAction>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEndpointRefreshKey((current) => current + 1)}
                disabled={!token || endpointLoading}
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
            ) : endpointLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : endpointLoadError ? (
              <Alert variant="destructive">
                <AlertTitle>Could not load incoming endpoints</AlertTitle>
                <AlertDescription>{endpointLoadError}</AlertDescription>
              </Alert>
            ) : ingressEndpoints.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                No incoming endpoints yet. Create one to get a dedicated POST URL.
              </p>
            ) : (
              <div className="space-y-2">
                {ingressEndpoints.map((endpoint) => (
                  <Button
                    key={endpoint.id}
                    variant={selectedEndpointId === endpoint.id ? "secondary" : "outline"}
                    className="w-full justify-start font-mono"
                    aria-pressed={selectedEndpointId === endpoint.id}
                    onClick={() => setSelectedEndpointId(endpoint.id)}
                  >
                    {endpoint.id}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create an endpoint</CardTitle>
            <CardDescription>Choose a reusable ID or generate a UUID.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={createEndpoint} className="space-y-5">
              <Field data-invalid={!!(endpointSubmitted && ingressIdError(newEndpointId.trim()))}>
                <FieldLabel htmlFor="incoming-endpoint-id">Endpoint ID</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="incoming-endpoint-id"
                    value={newEndpointId}
                    onChange={(event) => setNewEndpointId(event.target.value)}
                    placeholder="orders-production"
                    maxLength={64}
                    disabled={!token || endpointBusy}
                    aria-invalid={!!(endpointSubmitted && ingressIdError(newEndpointId.trim()))}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setNewEndpointId(crypto.randomUUID());
                      setEndpointSubmitted(false);
                    }}
                    disabled={!token || endpointBusy}
                    aria-label="Generate endpoint ID"
                  >
                    <RiRefreshLine /> Generate
                  </Button>
                </div>
                <FieldDescription>
                  1–64 lowercase letters, numbers, hyphens, or underscores. IDs cannot be changed.
                </FieldDescription>
                {endpointSubmitted && ingressIdError(newEndpointId.trim()) && (
                  <FieldError>{ingressIdError(newEndpointId.trim())}</FieldError>
                )}
              </Field>
              <Button type="submit" disabled={!token || endpointBusy}>
                <RiAddLine /> {endpointBusy ? "Creating…" : "Create endpoint"}
              </Button>
              {endpointFormError && (
                <Alert variant="destructive">
                  <AlertTitle>Endpoint was not created</AlertTitle>
                  <AlertDescription>{endpointFormError}</AlertDescription>
                </Alert>
              )}
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Send a test event</CardTitle>
            <CardDescription>
              Submissions use {selectedEndpointId ? `the ${selectedEndpointId} endpoint` : "the shared URL"} and create one delivery per registered destination.
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
                <FieldDescription>Send a JSON object of up to 200,000 characters.</FieldDescription>
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
              <Button type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send event"}
                <RiArrowRightLine data-icon="inline-end" />
              </Button>
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
                      {result.deliveryIds.map((id) => (
                        <Link
                          key={id}
                          to="/deliveries/$deliveryId"
                          params={{ deliveryId: id }}
                          className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                        >
                          {id}
                        </Link>
                      ))}
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{selectedEndpointId ? `Endpoint ${selectedEndpointId}` : "Shared ingress URL"}</CardTitle>
            <CardDescription>
              Send a POST request with the JSON body and Content-Type: application/json.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CopyBlock label="POST URL" value={webhookUrl} />
            <CopyBlock label="JSON body" value={requestBody} />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Replace localhost with your deployed API hostname when sharing externally. The event
              ID must be unique for each new event. The endpoint ID is reusable.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
