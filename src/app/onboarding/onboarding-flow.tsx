"use client";

import { CheckCircle2, CircleAlert, Loader2, XCircle } from "lucide-react";
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";

import { FieldError } from "@/components/form/field-error";
import { SubmitButton } from "@/components/form/submit-button";
import { DisciplinePicker } from "@/components/profile/discipline-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { FormState } from "@/lib/forms";
import {
  displayNameSchema,
  handleSchema,
  slugify,
  suggestHandle,
  type Discipline,
} from "@/lib/profile/schema";

import {
  checkHandle,
  continueAndFinish,
  createWorkspaceAndFinish,
  joinWorkspaceAndFinish,
  saveIdentity,
  type HandleAvailability,
} from "./actions";

type Invite = {
  id: string;
  workspaceName: string;
  role: string;
  invitedBy: string | null;
};

type Workspace = { id: string; name: string };

const STEPS = ["Your name", "Your handle", "Your discipline", "Workspace"];

const idle: FormState = { status: "idle" };

export function OnboardingFlow({
  next,
  initial,
  invites,
  workspaces,
}: {
  next: string;
  initial: {
    displayName: string;
    handle: string;
    discipline: Discipline | null;
  };
  invites: Invite[];
  workspaces: Workspace[];
}) {
  const identityDone = Boolean(
    initial.displayName && initial.handle && initial.discipline,
  );
  const [step, setStep] = useState(identityDone ? 3 : 0);
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [handle, setHandle] = useState(initial.handle);
  const [discipline, setDiscipline] = useState(initial.discipline);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    // Move focus to the new step's heading for keyboard and screen-reader users.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex gap-2" aria-label="Progress">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? "step" : undefined}
            className={`h-1.5 flex-1 rounded-full ${index <= step ? "bg-primary" : "bg-muted"}`}
          >
            <span className="sr-only">
              {label}
              {index < step ? " (done)" : ""}
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-base font-semibold outline-none"
        >
          {
            [
              "What should we call you?",
              "Pick your handle",
              "What kind of data work do you do?",
              "Join your team",
            ][step]
          }
        </h2>
      </div>

      {step === 0 && (
        <NameStep
          value={displayName}
          onChange={setDisplayName}
          onNext={() => {
            if (!handle) setHandle(suggestHandle(displayName));
            setStep(1);
          }}
        />
      )}
      {step === 1 && (
        <HandleStep
          value={handle}
          onChange={setHandle}
          onBack={() => setStep(0)}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <DisciplineStep
          identity={{ displayName, handle }}
          value={discipline}
          onChange={setDiscipline}
          onBack={() => setStep(1)}
          onSaved={() => setStep(3)}
          onHandleTaken={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <WorkspaceStep
          next={next}
          invites={invites}
          workspaces={workspaces}
          onBack={() => setStep(2)}
        />
      )}
    </div>
  );
}

function StepActions({
  onBack,
  children,
}: {
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-3">
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
      ) : (
        <span />
      )}
      {children}
    </div>
  );
}

function NameStep({
  value,
  onChange,
  onNext,
}: {
  value: string;
  onChange: (value: string) => void;
  onNext: () => void;
}) {
  const [error, setError] = useState<string>();
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const result = displayNameSchema.safeParse(value);
        if (!result.success) {
          setError(result.error.issues[0]?.message);
          return;
        }
        onChange(result.data);
        onNext();
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          name="displayName"
          autoComplete="name"
          autoFocus
          maxLength={100}
          placeholder="Ada Lovelace"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setError(undefined);
          }}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? "displayName-error" : undefined}
        />
        <FieldError id="displayName-error" message={error} />
      </div>
      <StepActions>
        <Button type="submit">Continue</Button>
      </StepActions>
    </form>
  );
}

function HandleStep({
  value,
  onChange,
  onBack,
  onNext,
}: {
  value: string;
  onChange: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  // Server answers keyed by the handle they are for; everything else derives.
  const [checked, setChecked] = useState<{
    handle: string;
    result: HandleAvailability;
  }>();
  const [, startTransition] = useTransition();
  const parsed = handleSchema.safeParse(value);
  const candidate = parsed.success ? parsed.data : null;

  const availability:
    HandleAvailability | { status: "checking" } | { status: "idle" } =
    !parsed.success
      ? value
        ? {
            status: "invalid",
            message: parsed.error.issues[0]?.message ?? "Invalid handle.",
          }
        : { status: "idle" }
      : checked?.handle === candidate
        ? checked.result
        : { status: "checking" };

  useEffect(() => {
    if (!candidate) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await checkHandle(candidate);
        if (!cancelled) setChecked({ handle: candidate, result });
      });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [candidate]);

  const canContinue = availability.status === "available";

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (canContinue) onNext();
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="handle">Handle</Label>
        <div className="flex items-center rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
          <span className="pl-3 text-muted-foreground" aria-hidden>
            @
          </span>
          <Input
            id="handle"
            name="handle"
            autoFocus
            autoCapitalize="none"
            autoComplete="username"
            spellCheck={false}
            maxLength={30}
            placeholder="ada_lovelace"
            value={value}
            onChange={(event) => onChange(event.target.value.toLowerCase())}
            className="border-0 bg-transparent pl-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
            aria-invalid={
              availability.status === "invalid" ||
              availability.status === "taken" ||
              undefined
            }
            aria-describedby="handle-status handle-hint"
          />
        </div>
        <p id="handle-hint" className="text-xs text-muted-foreground">
          Your profile lives at /u/{value || "handle"}. Lowercase letters,
          numbers and underscores; 3–30 characters.
        </p>
        <p
          id="handle-status"
          aria-live="polite"
          className="flex min-h-5 items-center gap-1.5 text-sm"
        >
          <HandleStatus availability={availability} />
        </p>
      </div>
      <StepActions onBack={onBack}>
        <Button type="submit" disabled={!canContinue}>
          Continue
        </Button>
      </StepActions>
    </form>
  );
}

function HandleStatus({
  availability,
}: {
  availability: HandleAvailability | { status: "checking" | "idle" };
}) {
  switch (availability.status) {
    case "checking":
      return (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          Checking availability…
        </span>
      );
    case "available":
      return (
        <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 aria-hidden className="size-4" />
          Available
        </span>
      );
    case "taken":
      return (
        <span className="flex items-center gap-1.5 text-destructive">
          <XCircle aria-hidden className="size-4" />
          Already taken
        </span>
      );
    case "invalid":
      return <span className="text-destructive">{availability.message}</span>;
    case "error":
      return (
        <span className="text-destructive">
          Could not check the handle. Try again.
        </span>
      );
    default:
      return null;
  }
}

function DisciplineStep({
  identity,
  value,
  onChange,
  onBack,
  onSaved,
  onHandleTaken,
}: {
  identity: { displayName: string; handle: string };
  value: Discipline | null;
  onChange: (value: Discipline) => void;
  onBack: () => void;
  onSaved: () => void;
  onHandleTaken: () => void;
}) {
  const [state, action] = useActionState(saveIdentity, idle);
  const labelId = useId();

  useEffect(() => {
    if (state.status === "saved") onSaved();
    if (state.status === "error" && state.fieldErrors?.handle) onHandleTaken();
  }, [state, onSaved, onHandleTaken]);

  const error =
    state.status === "error"
      ? (state.fieldErrors?.discipline ??
        state.fieldErrors?.displayName ??
        state.message)
      : undefined;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="displayName" value={identity.displayName} />
      <input type="hidden" name="handle" value={identity.handle} />
      <p id={labelId} className="sr-only">
        Discipline
      </p>
      <DisciplinePicker
        value={value}
        onValueChange={onChange}
        labelledBy={labelId}
        describedBy={error ? "discipline-error" : undefined}
        invalid={Boolean(error)}
      />
      <FieldError id="discipline-error" message={error} />
      <StepActions onBack={onBack}>
        <SubmitButton pendingLabel="Saving…" disabled={!value}>
          Continue
        </SubmitButton>
      </StepActions>
    </form>
  );
}

function FormAlert({ state }: { state: FormState }) {
  if (state.status !== "error" || !state.message) return null;
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden />
      <AlertTitle>Could not continue</AlertTitle>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

function WorkspaceStep({
  next,
  invites,
  workspaces,
  onBack,
}: {
  next: string;
  invites: Invite[];
  workspaces: Workspace[];
  onBack: () => void;
}) {
  const [continueState, continueAction] = useActionState(
    continueAndFinish,
    idle,
  );
  const [joinState, joinAction] = useActionState(joinWorkspaceAndFinish, idle);
  const [createState, createAction] = useActionState(
    createWorkspaceAndFinish,
    idle,
  );
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  const createErrors =
    createState.status === "error" ? createState.fieldErrors : undefined;

  return (
    <div className="flex flex-col gap-6">
      {workspaces.length > 0 && (
        <section
          aria-labelledby="existing-heading"
          className="flex flex-col gap-3"
        >
          <h3 id="existing-heading" className="text-sm font-medium">
            You already belong to
          </h3>
          <FormAlert state={continueState} />
          <form
            action={continueAction}
            className="flex items-center justify-between gap-3 rounded-lg border p-3"
          >
            <input type="hidden" name="next" value={next} />
            <span className="text-sm">
              {workspaces.map((w) => w.name).join(", ")}
            </span>
            <SubmitButton size="sm" pendingLabel="Finishing…">
              Continue
            </SubmitButton>
          </form>
        </section>
      )}

      {invites.length > 0 && (
        <section
          aria-labelledby="invites-heading"
          className="flex flex-col gap-3"
        >
          <h3 id="invites-heading" className="text-sm font-medium">
            Pending invites
          </h3>
          <FormAlert state={joinState} />
          <ul className="flex flex-col gap-2">
            {invites.map((invite) => (
              <li key={invite.id}>
                <form
                  action={joinAction}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <input type="hidden" name="inviteId" value={invite.id} />
                  <input type="hidden" name="next" value={next} />
                  <span className="flex flex-col text-sm">
                    <span className="font-medium">{invite.workspaceName}</span>
                    <span className="text-muted-foreground">
                      As {invite.role}
                      {invite.invitedBy
                        ? ` · invited by ${invite.invitedBy}`
                        : ""}
                    </span>
                  </span>
                  <SubmitButton
                    size="sm"
                    pendingLabel="Joining…"
                    aria-label={`Join ${invite.workspaceName}`}
                  >
                    Join
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(workspaces.length > 0 || invites.length > 0) && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Separator className="flex-1" />
          or
          <Separator className="flex-1" />
        </div>
      )}

      <section aria-labelledby="create-heading" className="flex flex-col gap-3">
        <h3 id="create-heading" className="text-sm font-medium">
          Create a workspace
        </h3>
        {invites.length === 0 && workspaces.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No pending invites for your email. Create a workspace for your team;
            you can invite people later.
          </p>
        )}
        <FormAlert state={createState} />
        <form action={createAction} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="workspace-name">Workspace name</Label>
            <Input
              id="workspace-name"
              name="name"
              maxLength={100}
              placeholder="Acme Data"
              required
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!slugEdited) setSlug(slugify(event.target.value));
              }}
              aria-invalid={Boolean(createErrors?.name) || undefined}
              aria-describedby={createErrors?.name ? "name-error" : undefined}
            />
            <FieldError id="name-error" message={createErrors?.name} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="workspace-slug">URL</Label>
            <div className="flex items-center rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
              <span className="pl-3 text-sm text-muted-foreground" aria-hidden>
                /w/
              </span>
              <Input
                id="workspace-slug"
                name="slug"
                maxLength={40}
                placeholder="acme-data"
                required
                autoCapitalize="none"
                spellCheck={false}
                value={slug}
                onChange={(event) => {
                  setSlug(event.target.value.toLowerCase());
                  setSlugEdited(true);
                }}
                className="border-0 bg-transparent pl-0.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
                aria-invalid={Boolean(createErrors?.slug) || undefined}
                aria-describedby={
                  createErrors?.slug ? "slug-error slug-hint" : "slug-hint"
                }
              />
            </div>
            <p id="slug-hint" className="text-xs text-muted-foreground">
              3–40 lowercase letters, numbers and dashes.
            </p>
            <FieldError id="slug-error" message={createErrors?.slug} />
          </div>
          <StepActions onBack={onBack}>
            <SubmitButton pendingLabel="Creating…">
              Create workspace
            </SubmitButton>
          </StepActions>
        </form>
      </section>
    </div>
  );
}
