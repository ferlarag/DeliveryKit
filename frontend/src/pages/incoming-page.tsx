import { RiArrowRightLine, RiInformationLine, RiRefreshLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CopyBlock } from "@/components/copy-block";
import { api, type EventResponse } from "@/lib/api";
import { trackDeliveryIds } from "@/lib/delivery-tracking";

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

export function IncomingPage() {
  const [eventId, setEventId] = useState<string>(() => crypto.randomUUID());
  const [payload, setPayload] = useState('{\n  "kind": "demo"\n}');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EventResponse | null>(null);

  const idError = submitted ? eventIdError(eventId) : null;
  const payloadResult = parsePayload(payload);
  const payloadError = submitted ? payloadResult.error : null;
  const apiOrigin =
    import.meta.env.VITE_API_ORIGIN ||
    (import.meta.env.DEV ? "http://localhost:8080" : window.location.origin);
  const webhookUrl = new URL("/webhooks", apiOrigin).toString();
  const requestBody = payloadResult.error
    ? "Fix the payload JSON to preview the request body."
    : JSON.stringify({ eventId, payload: payloadResult.value }, null, 2);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setError(null);
    setResult(null);
    if (eventIdError(eventId) || payloadResult.error) return;

    setBusy(true);
    try {
      const created = await api.submitEvent(eventId, payloadResult.value);
      trackDeliveryIds(created.deliveryIds);
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
        <Badge variant="secondary" className="mb-4">
          Incoming
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Receive a webhook event
        </h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Give a sender the URL and JSON shape below, or submit a test event here. Choose a unique
          event ID for each event.
        </p>
      </div>

      <Alert>
        <RiInformationLine />
        <AlertTitle>One shared ingress URL today</AlertTitle>
        <AlertDescription>
          DeliveryKit currently receives all events at the same POST URL. An event ID identifies one
          event and prevents duplicate payloads; it is not a reusable endpoint ID. Named ingress
          endpoints need API support.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Send a test event</CardTitle>
            <CardDescription>
              Submissions use the live API and create one delivery per registered destination.
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
                  Generate a UUID or enter your own ID. A different payload cannot reuse an existing
                  ID.
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
            <CardTitle>Give this to the sender</CardTitle>
            <CardDescription>
              Send a POST request with the JSON body and Content-Type: application/json.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CopyBlock label="POST URL" value={webhookUrl} />
            <CopyBlock label="JSON body" value={requestBody} />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Replace localhost with your deployed API hostname when sharing externally. The event
              ID must be unique for each new event.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
