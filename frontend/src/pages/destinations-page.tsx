import { RiAddLine, RiArrowRightLine, RiInformationLine, RiRefreshLine } from "@remixicon/react";
import { useEffect, useState } from "react";
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
  const [refreshKey, setRefreshKey] = useState(0);
  const validation = submitted ? endpointError(url.trim()) : null;

  useEffect(() => {
    let active = true;
    if (!token) {
      setEndpoints([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      api
        .endpoints(token)
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

  return (
    <div className="space-y-8">
      <div>
        <Badge variant="secondary" className="mb-4">
          Routing
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Destinations</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Register the URLs that receive webhook deliveries. Every accepted event currently goes to
          every registered destination.
        </p>
      </div>

      <Alert>
        <RiInformationLine />
        <AlertTitle>Global forwarding only</AlertTitle>
        <AlertDescription>
          Per-webhook destination choices, editing, and removal are not available in the current
          API. New destinations receive future events only.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
        <Card>
          <CardHeader>
            <div className="space-y-1.5">
              <CardTitle>Registered destinations</CardTitle>
              <CardDescription>These URLs are loaded from DeliveryKit.</CardDescription>
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
            ) : endpoints.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                No destinations yet. Add one to begin creating deliveries.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Destination URL</TableHead>
                    <TableHead className="text-right">ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {endpoints.map((endpoint) => (
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

      <Card className="bg-muted/30">
        <CardContent className="flex flex-wrap items-center gap-3 py-5 text-sm">
          <Badge variant="outline">Current flow</Badge>
          <span>POST /webhooks</span>
          <RiArrowRightLine className="size-4 text-muted-foreground" />
          <span>Queue one delivery for each destination above</span>
        </CardContent>
      </Card>
    </div>
  );
}
