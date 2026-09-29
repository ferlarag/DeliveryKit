export type Endpoint = { id: string; url: string };

export type Delivery = {
  id: string;
  eventId: string;
  targetUrl: string;
  payload: string;
  status: "PENDING" | "FAILED" | "SUCCEEDED" | string;
  attempts: number;
  lastError: string | null;
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
  endpoints: (token: string) => request<Endpoint[]>("/endpoints", { headers: adminHeaders(token) }),
  addEndpoint: (token: string, url: string) =>
    request<Endpoint>("/endpoints", {
      method: "POST",
      headers: adminHeaders(token),
      body: JSON.stringify({ url }),
    }),
  submitEvent: (eventId: string, payload: unknown) =>
    request<EventResponse>("/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, payload }),
    }),
  delivery: (id: string) => request<Delivery>(`/deliveries/${encodeURIComponent(id)}`),
  retry: (id: string, token: string) =>
    request<{ id: string; status: string }>(`/deliveries/${encodeURIComponent(id)}/retry`, {
      method: "POST",
      headers: adminHeaders(token),
    }),
};
