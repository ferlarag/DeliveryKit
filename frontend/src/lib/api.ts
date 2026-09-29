export type Endpoint = { id: string; url: string };
export type IngressEndpoint = { id: string; createdAt: string };

export type Delivery = {
  id: string;
  eventId: string;
  sourceUrl: string | null;
  targetUrl: string;
  payload: string;
  status: "PENDING" | "FAILED" | "SUCCEEDED" | string;
  attempts: number;
  lastError: string | null;
};

export type DeliveryAttempt = {
  id: string;
  number: number;
  initiatedBy: "MANUAL" | "AUTOMATIC";
  status: "PROCESSING" | "SUCCEEDED" | "FAILED";
  startedAt: string;
  completedAt: string | null;
  httpStatus: number | null;
  error: string | null;
};

export type EventResponse = { eventId: string; deliveryIds: string[] };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new Error("Could not reach DeliveryKit. Check that the API is running.");
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body && typeof body.detail === "string" ? body.detail : null;
    throw new Error(detail || `Request failed (HTTP ${response.status}).`);
  }
  return body as T;
}

function adminHeaders(token: string): HeadersInit {
  return { "X-Admin-Token": token, "Content-Type": "application/json" };
}

export const api = {
  ingressEndpoints: (token: string) =>
    request<IngressEndpoint[]>("/ingress-endpoints", { headers: adminHeaders(token) }),
  addIngressEndpoint: (token: string, id: string) =>
    request<IngressEndpoint>("/ingress-endpoints", {
      method: "POST",
      headers: adminHeaders(token),
      body: JSON.stringify({ id }),
    }),
  endpoints: (token: string) => request<Endpoint[]>("/endpoints", { headers: adminHeaders(token) }),
  addEndpoint: (token: string, url: string) =>
    request<Endpoint>("/endpoints", {
      method: "POST",
      headers: adminHeaders(token),
      body: JSON.stringify({ url }),
    }),
  submitEvent: (eventId: string, payload: unknown, sourceUrl?: string, endpointId?: string) =>
    request<EventResponse>(endpointId ? `/webhooks/${encodeURIComponent(endpointId)}` : "/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, payload, ...(sourceUrl && { sourceUrl }) }),
    }),
  delivery: (id: string) => request<Delivery>(`/deliveries/${encodeURIComponent(id)}`),
  attempts: (id: string) =>
    request<DeliveryAttempt[]>(`/deliveries/${encodeURIComponent(id)}/attempts`),
  retry: (id: string, token: string) =>
    request<{ id: string; status: string }>(`/deliveries/${encodeURIComponent(id)}/retry`, {
      method: "POST",
      headers: adminHeaders(token),
    }),
};
