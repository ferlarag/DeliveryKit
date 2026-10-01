export function webhookUrlFor(id: string) {
  const apiOrigin =
    import.meta.env.VITE_API_ORIGIN ||
    (import.meta.env.DEV ? "http://localhost:8080" : window.location.origin);
  return new URL(`/webhooks/${encodeURIComponent(id)}`, apiOrigin).toString();
}
