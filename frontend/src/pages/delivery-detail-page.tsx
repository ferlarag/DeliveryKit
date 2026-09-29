import { RiArrowLeftLine, RiInformationLine, RiRefreshLine, RiRestartLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CopyBlock } from "@/components/copy-block";
import { DeliveryStatus } from "@/components/delivery-status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Delivery } from "@/lib/api";
import { trackDeliveryIds } from "@/lib/delivery-tracking";
import { useAdminToken } from "@/lib/use-admin-token";

function displayPayload(payload: string) {
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}

export function DeliveryDetailPage({ id }: { id: string }) {
  const token = useAdminToken();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .delivery(id)
      .then(
        (data) => {
          if (active) {
            setDelivery(data);
            trackDeliveryIds([id]);
          }
        },
        (cause) => {
          if (active)
            setError(cause instanceof Error ? cause.message : "Could not load this delivery.");
        },
      )
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, refreshKey]);

  async function retry() {
    if (!token || !delivery || delivery.status !== "FAILED") return;
    setRetrying(true);
    setRetryError(null);
    setRetryMessage(null);
    try {
      await api.retry(id, token);
      setRetryMessage("Retry queued. Refresh to follow its status.");
      setRefreshKey((current) => current + 1);
    } catch (cause) {
      setRetryError(cause instanceof Error ? cause.message : "Could not retry this delivery.");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/deliveries"
          className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <RiArrowLeftLine className="size-4" /> All tracked deliveries
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Delivery detail</h1>
            <p className="mt-2 break-all font-mono text-sm text-muted-foreground">{id}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => setRefreshKey((current) => current + 1)}
            disabled={loading}
          >
            <RiRefreshLine /> Refresh
          </Button>
        </div>
      </div>

      {loading && !delivery ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
        </div>
      ) : error && !delivery ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load delivery</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : delivery ? (
        <>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Refresh failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-5 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
                <CardDescription>Current state from DeliveryKit</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <DeliveryStatus status={delivery.status} />
                <div className="text-sm text-muted-foreground">
                  {delivery.attempts} delivery {delivery.attempts === 1 ? "attempt" : "attempts"}{" "}
                  recorded
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Origin</CardTitle>
                <CardDescription>Incoming event</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="text-muted-foreground">Event ID</div>
                <div className="break-all font-mono">{delivery.eventId}</div>
                <div className="pt-2 text-xs text-muted-foreground">
                  Sender URL, IP, and source identity are not recorded by the API.
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Destination</CardTitle>
                <CardDescription>Webhook recipient</CardDescription>
              </CardHeader>
              <CardContent className="break-all text-sm font-medium">
                {delivery.targetUrl}
              </CardContent>
            </Card>
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Payload</CardTitle>
                <CardDescription>JSON body sent to the destination</CardDescription>
              </CardHeader>
              <CardContent>
                <CopyBlock label="Delivery payload" value={displayPayload(delivery.payload)} />
              </CardContent>
            </Card>
            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>Attempts &amp; retry</CardTitle>
                  <CardDescription>Current delivery summary</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="rounded-xl border bg-muted/30 p-4 text-sm">
                    <div className="font-medium">
                      {delivery.attempts} total {delivery.attempts === 1 ? "attempt" : "attempts"}
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      Individual results and timestamps are not exposed by the API.
                    </p>
                  </div>
                  {delivery.lastError && (
                    <div className="space-y-1 text-sm">
                      <div className="font-medium">Latest error</div>
                      <p className="break-words text-destructive">{delivery.lastError}</p>
                    </div>
                  )}
                  <Button
                    onClick={retry}
                    disabled={delivery.status !== "FAILED" || !token || retrying}
                  >
                    <RiRestartLine />
                    {retrying ? "Queuing…" : "Retry failed delivery"}
                  </Button>
                  {!token && delivery.status === "FAILED" && (
                    <p className="text-xs text-muted-foreground">
                      Enter the admin token in the header to retry.
                    </p>
                  )}
                  {retryError && (
                    <Alert variant="destructive">
                      <AlertTitle>Retry failed</AlertTitle>
                      <AlertDescription>{retryError}</AlertDescription>
                    </Alert>
                  )}
                  {retryMessage && (
                    <Alert>
                      <AlertTitle>Retry requested</AlertTitle>
                      <AlertDescription>{retryMessage}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
              <Alert>
                <RiInformationLine />
                <AlertTitle>Attempt history unavailable</AlertTitle>
                <AlertDescription>
                  The API returns only the total attempt count, current status, and latest error. It
                  does not return separate failures, successes, or manual retry events.
                </AlertDescription>
              </Alert>
              <CopyBlock label="Idempotency-Key" value={delivery.id} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
