import { describe, expect, it } from "vitest";

import { initials } from "./profile-avatar";

describe("initials", () => {
  it.each([
    ["Ada Lovelace", "AL"],
    ["Ada Augusta King Lovelace", "AL"],
    ["ada", "A"],
    ["  ", "?"],
    [null, "?"],
  ])("initials(%j) = %j", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
