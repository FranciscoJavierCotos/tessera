import { describe, expect, it, vi } from "vitest";

import { createCookieMethods, type CookieStore } from "./cookies";

function memoryStore(initial: Record<string, string> = {}) {
  const jar = new Map(Object.entries(initial));
  const store: CookieStore = {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: vi.fn((name: string, value: string) => jar.set(name, value)),
  };
  return { jar, store };
}

describe("createCookieMethods", () => {
  it("returns every cookie from the store", async () => {
    const { store } = memoryStore({ "sb-access": "a", theme: "dark" });

    const methods = createCookieMethods(store);

    expect(await methods.getAll()).toEqual([
      { name: "sb-access", value: "a" },
      { name: "theme", value: "dark" },
    ]);
  });

  it("writes every cookie with its options", () => {
    const { jar, store } = memoryStore();
    const options = { httpOnly: true, path: "/" };

    createCookieMethods(store).setAll?.(
      [
        { name: "sb-access", value: "a", options },
        { name: "sb-refresh", value: "r", options },
      ],
      {},
    );

    expect(store.set).toHaveBeenCalledWith("sb-access", "a", options);
    expect(store.set).toHaveBeenCalledWith("sb-refresh", "r", options);
    expect(Object.fromEntries(jar)).toEqual({
      "sb-access": "a",
      "sb-refresh": "r",
    });
  });

  it("ignores read-only stores (Server Components)", () => {
    const store: CookieStore = {
      getAll: () => [],
      set: () => {
        throw new Error("Cookies can only be modified in a Server Action");
      },
    };

    expect(() =>
      createCookieMethods(store).setAll?.(
        [{ name: "sb-access", value: "a", options: {} }],
        {},
      ),
    ).not.toThrow();
  });
});
