import { describe, expect, it } from "vitest";

import {
  avatarFileError,
  dedupeSkills,
  handleSchema,
  identitySchema,
  isOwnAvatarPath,
  linkSchema,
  newAvatarPath,
  parseLinks,
  profileEditSchema,
  slugify,
  suggestHandle,
  workspaceSchema,
} from "./schema";

describe("handleSchema", () => {
  it("normalizes case and whitespace", () => {
    expect(handleSchema.parse("  Ada_Lovelace ")).toBe("ada_lovelace");
  });

  it.each(["ab", "a".repeat(31), "ada-lovelace", "ada lovelace", "adá"])(
    "rejects %j",
    (handle) => {
      expect(handleSchema.safeParse(handle).success).toBe(false);
    },
  );
});

describe("identitySchema", () => {
  it("accepts a complete identity", () => {
    expect(
      identitySchema.parse({
        displayName: " Ada ",
        handle: "ada",
        discipline: "data_engineer",
      }),
    ).toEqual({
      displayName: "Ada",
      handle: "ada",
      discipline: "data_engineer",
    });
  });

  it("rejects an unknown discipline and a blank name", () => {
    const result = identitySchema.safeParse({
      displayName: "   ",
      handle: "ada",
      discipline: "wizard",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0]).sort()).toEqual([
      "discipline",
      "displayName",
    ]);
  });
});

describe("workspaceSchema", () => {
  it("accepts a name and a slug", () => {
    expect(workspaceSchema.parse({ name: "Acme", slug: "Acme-Data" })).toEqual({
      name: "Acme",
      slug: "acme-data",
    });
  });

  it.each(["ac", "acme_data", "acme data", "a".repeat(41)])(
    "rejects slug %j",
    (slug) => {
      expect(workspaceSchema.safeParse({ name: "Acme", slug }).success).toBe(
        false,
      );
    },
  );
});

describe("linkSchema", () => {
  it("accepts http(s) URLs", () => {
    expect(
      linkSchema.parse({ label: " GitHub ", url: " https://github.com/ada " }),
    ).toEqual({ label: "GitHub", url: "https://github.com/ada" });
  });

  it.each(["javascript:alert(1)", "ftp://example.com", "example.com", ""])(
    "rejects %j",
    (url) => {
      expect(linkSchema.safeParse({ label: "x", url }).success).toBe(false);
    },
  );
});

describe("profileEditSchema", () => {
  const valid = {
    displayName: "Ada",
    discipline: "lead",
    bio: "",
    skills: ["dbt", "SQL", "sql"],
    links: [],
    avatarPath: null,
  };

  it("dedupes skills case-insensitively", () => {
    expect(profileEditSchema.parse(valid).skills).toEqual(["dbt", "SQL"]);
  });

  it("caps skills and links", () => {
    expect(
      profileEditSchema.safeParse({
        ...valid,
        skills: Array.from({ length: 21 }, (_, i) => `s${i}`),
      }).success,
    ).toBe(false);
    expect(
      profileEditSchema.safeParse({
        ...valid,
        links: Array.from({ length: 6 }, () => ({
          label: "x",
          url: "https://x.dev",
        })),
      }).success,
    ).toBe(false);
  });
});

describe("helpers", () => {
  it("dedupeSkills keeps the first spelling", () => {
    expect(dedupeSkills(["Python", "python", "SQL"])).toEqual([
      "Python",
      "SQL",
    ]);
  });

  it("parseLinks drops malformed entries", () => {
    expect(
      parseLinks([
        { label: "Site", url: "https://ada.dev" },
        { label: "Bad", url: "javascript:alert(1)" },
        "nope",
      ]),
    ).toEqual([{ label: "Site", url: "https://ada.dev" }]);
    expect(parseLinks({})).toEqual([]);
  });

  it.each([
    ["Ada Lovelace", "ada_lovelace"],
    ["  José  Núñez! ", "jose_nunez"],
    ["---", ""],
  ])("suggestHandle(%j) = %j", (name, handle) => {
    expect(suggestHandle(name)).toBe(handle);
  });

  it.each([
    ["Acme Data", "acme-data"],
    ["Ünïcode & Co.", "unicode-co"],
  ])("slugify(%j) = %j", (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it("isOwnAvatarPath only accepts a file directly in the user's folder", () => {
    const id = "00000000-0000-4000-a000-00000000000a";
    expect(isOwnAvatarPath(`${id}/avatar.png`, id)).toBe(true);
    expect(isOwnAvatarPath(`${id}/`, id)).toBe(false);
    expect(isOwnAvatarPath(`${id}/../other/avatar.png`, id)).toBe(false);
    expect(isOwnAvatarPath(`other/${id}/avatar.png`, id)).toBe(false);
  });
});

describe("avatars", () => {
  it("accepts raster images up to 2 MB", () => {
    expect(avatarFileError({ type: "image/png", size: 2 * 1024 * 1024 })).toBe(
      null,
    );
  });

  it("rejects other types and larger files", () => {
    expect(avatarFileError({ type: "image/svg+xml", size: 10 })).toMatch(/PNG/);
    expect(
      avatarFileError({ type: "image/jpeg", size: 2 * 1024 * 1024 + 1 }),
    ).toMatch(/2 MB/);
  });

  it("builds a path inside the user's folder", () => {
    const path = newAvatarPath("u1", "image/jpeg", "abc");
    expect(path).toBe("u1/abc.jpg");
    expect(isOwnAvatarPath(path, "u1")).toBe(true);
  });
});
