import { describe, expect, it } from "vite-plus/test";
import { parseDemoDeliveryIds } from "./delivery-tracking";

const id = "d93ff6aa-f994-4047-971d-af87162023dc";

describe("demo delivery ID import", () => {
  it("accepts the seed script format", () => {
    expect(
      parseDemoDeliveryIds(JSON.stringify({ format: "deliverykit-demo-v1", deliveryIds: [id] })),
    ).toEqual([id]);
  });

  it("rejects malformed or unrelated files", () => {
    expect(() => parseDemoDeliveryIds("not JSON")).toThrow("valid JSON");
    expect(() =>
      parseDemoDeliveryIds(JSON.stringify({ format: "other", deliveryIds: [id] })),
    ).toThrow("demo ID file");
    expect(() =>
      parseDemoDeliveryIds(
        JSON.stringify({ format: "deliverykit-demo-v1", deliveryIds: ["nope"] }),
      ),
    ).toThrow("demo ID file");
    expect(() =>
      parseDemoDeliveryIds(
        JSON.stringify({ format: "deliverykit-demo-v1", deliveryIds: Array(101).fill(id) }),
      ),
    ).toThrow("demo ID file");
  });
});
