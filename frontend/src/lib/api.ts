export type Endpoint = { id: string; url: string; archivedAt: string | null };
export type IngressEndpoint = {
  id: string;
  createdAt: string;
  archivedAt: string | null;
  destinationIds: string[];
};

export type Delivery = {
  id: string;
  eventId: string;
  sourceUrl: string | null;
  targetUrl: string;
  payload: string;
  status: "PENDING" | "FAILED" | "SUCCEEDED" | string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DeliverySummary = Pick<
  Delivery,
  "id" | "eventId" | "targetUrl" | "status" | "attempts" | "createdAt" | "updatedAt"
>;
export type DeliveryPage = { items: DeliverySummary[]; total: number; page: number; size: number };
export type DeliveryFilters = {
  deliveryId?: string;
  eventId?: string;
  destination?: string;
  status?: string;
  attemptsMin?: string;
  attemptsMax?: string;
  createdFrom?: string;
  createdBefore?: string;
  updatedFrom?: string;
  updatedBefore?: string;
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
  addIngressEndpoint: (token: string, id: string, destinationIds: string[]) =>
    request<IngressEndpoint>("/ingress-endpoints", {
      method: "POST",
      headers: adminHeaders(token),
      body: JSON.stringify({ id, destinationIds }),
    }),
  updateIngressDestinations: (token: string, id: string, destinationIds: string[]) =>
    request<IngressEndpoint>(`/ingress-endpoints/${encodeURIComponent(id)}/destinations`, {
      method: "PUT",
      headers: adminHeaders(token),
      body: JSON.stringify({ destinationIds }),
    }),
  archiveIngressEndpoint: (token: string, id: string) =>
    request<IngressEndpoint>(`/ingress-endpoints/${encodeURIComponent(id)}/archive`, {
      method: "POST",
      headers: adminHeaders(token),
    }),
  restoreIngressEndpoint: (token: string, id: string) =>
    request<IngressEndpoint>(`/ingress-endpoints/${encodeURIComponent(id)}/restore`, {
      method: "POST",
      headers: adminHeaders(token),
    }),
  deleteIngressEndpoint: (token: string, id: string) =>
    request<void>(`/ingress-endpoints/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: adminHeaders(token),
    }),
  endpoints: (token: string, includeArchived = false) =>
    request<Endpoint[]>(includeArchived ? "/endpoints?includeArchived=true" : "/endpoints", {
      headers: adminHeaders(token),
    }),
  addEndpoint: (token: string, url: string) =>
    request<Endpoint>("/endpoints", {
      method: "POST",
      headers: adminHeaders(token),
      body: JSON.stringify({ url }),
    }),
  updateEndpoint: (token: string, id: string, url: string) =>
    request<Endpoint>(`/endpoints/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: adminHeaders(token),
      body: JSON.stringify({ url }),
    }),
  removeEndpoint: (token: string, id: string) =>
    request<void>(`/endpoints/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: adminHeaders(token),
    }),
  restoreEndpoint: (token: string, id: string) =>
    request<Endpoint>(`/endpoints/${encodeURIComponent(id)}/restore`, {
      method: "POST",
      headers: adminHeaders(token),
    }),
  submitEvent: (eventId: string, payload: unknown, sourceUrl?: string, endpointId?: string) =>
    request<EventResponse>(
      endpointId ? `/webhooks/${encodeURIComponent(endpointId)}` : "/webhooks",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, payload, ...(sourceUrl && { sourceUrl }) }),
      },
    ),
  delivery: (id: string) => request<Delivery>(`/deliveries/${encodeURIComponent(id)}`),
  deliveries: (token: string, filters: DeliveryFilters, page: number, size: number) => {
    const params = new URLSearchParams({ page: String(page), size: String(size) });
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    return request<DeliveryPage>(`/deliveries?${params}`, { headers: adminHeaders(token) });
  },
  attempts: (id: string) =>
    request<DeliveryAttempt[]>(`/deliveries/${encodeURIComponent(id)}/attempts`),
  retry: (id: string, token: string) =>
    request<{ id: string; status: string }>(`/deliveries/${encodeURIComponent(id)}/retry`, {
      method: "POST",
      headers: adminHeaders(token),
    }),
};
