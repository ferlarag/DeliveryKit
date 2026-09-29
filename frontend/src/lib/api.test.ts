import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("DeliveryKit API client", () => {
  it("submits an event with its payload and returns delivery IDs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ eventId: "evt-1", deliveryIds: ["delivery-1"] }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.submitEvent("evt-1", { kind: "demo" })).resolves.toEqual({
      eventId: "evt-1",
      deliveryIds: ["delivery-1"],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/webhooks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ eventId: "evt-1", payload: { kind: "demo" } }),
      }),
    );
  });

  it("sends the admin token for destination creation and retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "endpoint-1", url: "https://example.com/hook" }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "delivery-1", status: "PENDING" }), { status: 202 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await api.addEndpoint("secret", "https://example.com/hook");
    await api.retry("delivery-1", "secret");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/endpoints",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Admin-Token": "secret" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/deliveries/delivery-1/retry",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Admin-Token": "secret" }),
      }),
    );
  });

  it("shows the API problem detail when a request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Only failed deliveries can be retried" }), {
          status: 409,
        }),
      ),
    );

    await expect(api.retry("delivery-1", "secret")).rejects.toThrow(
      "Only failed deliveries can be retried",
    );
  });
});
