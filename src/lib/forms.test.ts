import { describe, expect, it } from "vitest";
import { z } from "zod";

import { fieldErrors } from "./forms";

describe("fieldErrors", () => {
  it("keys the first message per field by its dotted path", () => {
    const schema = z.object({
      name: z.string().min(2, { error: "too short" }).max(1, { error: "x" }),
      links: z.array(z.object({ url: z.url({ error: "bad url" }) })),
    });
    const result = schema.safeParse({ name: "a", links: [{ url: "nope" }] });

    expect(fieldErrors(result.error!)).toEqual({
      name: "too short",
      "links.0.url": "bad url",
    });
  });

  it("uses `form` for root issues", () => {
    const result = z.string({ error: "required" }).safeParse(1);
    expect(fieldErrors(result.error!)).toEqual({ form: "required" });
  });
});
