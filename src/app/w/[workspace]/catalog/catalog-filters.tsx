"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ASSET_KIND_PLURALS, ASSET_KINDS } from "@/lib/asset/kinds";
import {
  catalogSearch,
  CATALOG_SORT_LABELS,
  CATALOG_SORTS,
  hasCatalogFilters,
  type CatalogQuery,
} from "@/lib/asset/schema";

const ALL = "all";

type Option = { value: string; label: string };

/**
 * Filters (kind, owner, tag, project) and sort for the catalog. Each change
 * navigates to the matching URL and resets to the first page.
 */
export function CatalogFilters({
  basePath,
  query,
  owners,
  tags,
  projects,
}: {
  basePath: string;
  query: CatalogQuery;
  owners: Option[];
  tags: string[];
  projects: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const go = (patch: Partial<CatalogQuery>) =>
    startTransition(() =>
      router.push(
        `${basePath}${catalogSearch({ ...query, page: 1, ...patch })}`,
      ),
    );

  return (
    <div
      role="group"
      aria-label="Filter and sort the catalog"
      aria-busy={pending}
      className="flex flex-wrap items-end gap-3"
    >
      <FilterSelect
        id="filter-kind"
        label="Kind"
        value={query.kind ?? ALL}
        allLabel="All kinds"
        options={ASSET_KINDS.map((k) => ({
          value: k,
          label: ASSET_KIND_PLURALS[k],
        }))}
        onChange={(value) =>
          go({ kind: value === ALL ? null : (value as CatalogQuery["kind"]) })
        }
      />
      <FilterSelect
        id="filter-owner"
        label="Owner"
        value={query.owner ?? ALL}
        allLabel="Anyone"
        options={owners}
        onChange={(value) => go({ owner: value === ALL ? null : value })}
      />
      <FilterSelect
        id="filter-tag"
        label="Tag"
        value={query.tag ?? ALL}
        allLabel="Any tag"
        options={tags.map((tag) => ({ value: tag, label: `#${tag}` }))}
        onChange={(value) => go({ tag: value === ALL ? null : value })}
      />
      <FilterSelect
        id="filter-project"
        label="Project"
        value={query.project ?? ALL}
        allLabel="Any project"
        options={projects}
        onChange={(value) => go({ project: value === ALL ? null : value })}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="catalog-sort" className="text-xs text-muted-foreground">
          Sort by
        </Label>
        <Select
          value={query.sort}
          onValueChange={(value) => go({ sort: value as CatalogQuery["sort"] })}
        >
          <SelectTrigger id="catalog-sort" size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATALOG_SORTS.map((sort) => (
              <SelectItem key={sort} value={sort}>
                {CATALOG_SORT_LABELS[sort]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {hasCatalogFilters(query) && (
        <Button asChild variant="ghost" size="sm">
          <Link
            href={`${basePath}${catalogSearch({ ...query, kind: null, owner: null, tag: null, project: null, page: 1 })}`}
          >
            <X aria-hidden />
            Clear filters
          </Link>
        </Button>
      )}
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  allLabel: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} size="sm" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
