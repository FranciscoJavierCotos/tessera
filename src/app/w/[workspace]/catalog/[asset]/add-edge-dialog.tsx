"use client";

import { CircleAlert, Loader2, Plus, Search } from "lucide-react";
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import { ASSET_KIND_ICONS } from "@/components/asset/asset-badges";
import { FieldError } from "@/components/form/field-error";
import { SubmitButton } from "@/components/form/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ASSET_KIND_LABELS } from "@/lib/asset/kinds";
import type { FormState } from "@/lib/forms";
import {
  ASSET_RELATIONS,
  RELATION_LABELS,
  type EdgeDirection,
} from "@/lib/lineage/lineage";

import {
  addAssetEdge,
  searchAssets,
  type AssetOption,
} from "../lineage-actions";

const idle: FormState = { status: "idle" };

const COPY: Record<
  EdgeDirection,
  { trigger: string; title: string; description: (name: string) => string }
> = {
  upstream: {
    trigger: "Add upstream",
    title: "Add an upstream asset",
    description: (name) => `Pick the asset whose data flows into ${name}.`,
  },
  downstream: {
    trigger: "Add downstream",
    title: "Add a downstream asset",
    description: (name) => `Pick the asset that ${name}'s data flows into.`,
  },
};

/** "Add upstream / downstream": search the catalog, pick an asset and a relation. */
export function AddEdgeDialog({
  direction,
  assetId,
  assetName,
  workspaceId,
}: {
  direction: EdgeDirection;
  assetId: string;
  assetName: string;
  workspaceId: string;
}) {
  const [open, setOpen] = useState(false);
  // A fresh form (query, choice, errors) every time the dialog opens.
  const [session, setSession] = useState(0);
  const copy = COPY[direction];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setSession((s) => s + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus aria-hidden />
          {copy.trigger}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description(assetName)}</DialogDescription>
        </DialogHeader>
        <AddEdgeForm
          key={session}
          direction={direction}
          assetId={assetId}
          workspaceId={workspaceId}
          onSaved={(name) => {
            toast.success(
              direction === "upstream"
                ? `${name} now feeds ${assetName}`
                : `${assetName} now feeds ${name}`,
            );
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function AddEdgeForm({
  direction,
  assetId,
  workspaceId,
  onSaved,
}: {
  direction: EdgeDirection;
  assetId: string;
  workspaceId: string;
  onSaved: (name: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AssetOption[] | null>(null);
  const [searchError, setSearchError] = useState(false);
  const [searching, startSearch] = useTransition();
  const [chosen, setChosen] = useState<AssetOption | null>(null);
  const [relation, setRelation] = useState<string>("feeds");
  const chosenName = useRef("");
  useEffect(() => {
    chosenName.current = chosen?.name ?? "";
  }, [chosen]);

  const [state, action] = useActionState(
    async (previous: FormState, formData: FormData) => {
      const result = await addAssetEdge(previous, formData);
      if (result.status === "saved") onSaved(chosenName.current);
      return result;
    },
    idle,
  );
  const errors = state.status === "error" ? state.fieldErrors : undefined;

  useEffect(() => {
    const timer = setTimeout(
      () =>
        startSearch(async () => {
          try {
            const found = await searchAssets({
              workspaceId,
              excludeId: assetId,
              query,
            });
            setResults(found);
            setSearchError(false);
          } catch {
            setSearchError(true);
          }
        }),
      query ? 250 : 0,
    );
    return () => clearTimeout(timer);
  }, [query, workspaceId, assetId]);

  // Keep the chosen asset visible even when a new search no longer lists it.
  const options =
    chosen && results && !results.some((r) => r.id === chosen.id)
      ? [chosen, ...results]
      : (results ?? []);

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {state.status === "error" && state.message && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>Could not add the connection</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="assetId" value={assetId} />
      <input type="hidden" name="direction" value={direction} />
      <input type="hidden" name="otherAssetId" value={chosen?.id ?? ""} />

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-search`}>Search the catalog</Label>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={`${id}-search`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or qualified name"
            autoComplete="off"
            className="pl-8"
            aria-controls={`${id}-results`}
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Asset</legend>
        <div
          id={`${id}-results`}
          aria-live="polite"
          aria-busy={searching}
          className="max-h-64 overflow-y-auto rounded-lg border"
        >
          {searchError ? (
            <p className="p-3 text-sm text-destructive">
              Could not search the catalog. Try again.
            </p>
          ) : results === null ? (
            <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              Loading assets…
            </p>
          ) : options.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              {query
                ? "No assets match."
                : "No other assets in the catalog yet."}
            </p>
          ) : (
            <RadioGroup
              value={chosen?.id ?? ""}
              onValueChange={(value) =>
                setChosen(options.find((o) => o.id === value) ?? null)
              }
              aria-invalid={Boolean(errors?.otherAssetId) || undefined}
              aria-describedby={
                errors?.otherAssetId ? `${id}-asset-error` : undefined
              }
              className="gap-0 divide-y"
            >
              {options.map((option) => {
                const Icon = ASSET_KIND_ICONS[option.kind];
                const itemId = `${id}-asset-${option.id}`;
                return (
                  <label
                    key={option.id}
                    htmlFor={itemId}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50 has-data-checked:shadow-[inset_3px_0_0_var(--primary)]"
                  >
                    <RadioGroupItem id={itemId} value={option.id} />
                    <Icon
                      aria-hidden
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {option.name}
                        <span className="sr-only">
                          {`, ${ASSET_KIND_LABELS[option.kind]}`}
                        </span>
                      </span>
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {option.qualifiedName}
                      </span>
                    </span>
                  </label>
                );
              })}
            </RadioGroup>
          )}
        </div>
        <FieldError id={`${id}-asset-error`} message={errors?.otherAssetId} />
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-relation`}>Relation</Label>
        <Select name="relation" value={relation} onValueChange={setRelation}>
          <SelectTrigger
            id={`${id}-relation`}
            className="w-full"
            aria-invalid={Boolean(errors?.relation) || undefined}
            aria-describedby={`${id}-relation-hint${errors?.relation ? ` ${id}-relation-error` : ""}`}
          >
            <SelectValue placeholder="Choose a relation" />
          </SelectTrigger>
          <SelectContent>
            {ASSET_RELATIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {RELATION_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id={`${id}-relation-hint`} className="text-xs text-muted-foreground">
          Arrows always point the way data flows, from upstream to downstream.
        </p>
        <FieldError id={`${id}-relation-error`} message={errors?.relation} />
      </div>

      <DialogFooter>
        <SubmitButton pendingLabel="Adding…">Add connection</SubmitButton>
      </DialogFooter>
    </form>
  );
}
