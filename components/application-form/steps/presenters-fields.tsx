"use client";

import { useEffect, useRef, useState } from "react";
import {
  FormCard,
  FormField,
  FormInput,
  FormLabel,
  FormSelect,
} from "@/components/application-form/form-controls";
import { CountedTextarea } from "@/components/application-form/counted-fields";
import { FieldError } from "@/components/application-form/field-errors";
import {
  MAX_PRESENTERS,
  PRESENTER_ROLES,
  type ApplicationData,
  type PresenterData,
} from "@/lib/forms/application/schemas";
import type { FieldErrors } from "@/lib/forms/field-errors";

/*
  Presenters step fields (application "Step 3" data). Presenter 1 is always the
  Primary Presenter; "Add another presenter" appends Co-Presenter / Moderator
  cards up to MAX_PRESENTERS. Shared by the standalone wizard and both event
  session sub-wizards.

  Fields post as presenter_<i>_<field>, where <i> is the card's CURRENT
  position, so the post is always contiguous. presentersRawFromForm forces the
  roles (presenter 1 Primary, never Primary after that).

  Error keys are presenter_<i>_*, mapped from Zod paths like
  ["presenters", 2, "bio"] by lib/forms/field-errors.ts against the draft as
  the server saw it. A saved card keeps that index (savedIndex) for its error
  lookup AND its element ids, so the error summary's #presenter_<i>_* anchors
  still land on the right card after a card above it is removed.

  Inputs stay uncontrolled (defaultValue from the draft); the client state only
  tracks which cards exist. Only the presenters slice is passed in, so the rest
  of the draft (outline, creator bio) isn't serialized to the client.
*/
const [PRIMARY_ROLE, ...ADDED_ROLES] = PRESENTER_ROLES;
const DEFAULT_DISCLOSURE = "No relevant financial relationships to disclose";

type Card = {
  key: number;
  /** Index in the saved draft, for error lookup. Absent on newly added cards. */
  savedIndex?: number;
  initial: Partial<PresenterData>;
};

/** Element id for one field of a card. Stable for the card's lifetime. */
function fieldId(card: Card, field: string) {
  return card.savedIndex === undefined
    ? `presenter-card-${card.key}-${field}`
    : `presenter_${card.savedIndex}_${field}`;
}

const TEXT_FIELDS = ["name", "commercialDisclosure", "experience", "training", "bio"];

/** True when the card holds something worth confirming before discarding. */
function cardHasInput(card: Card) {
  return TEXT_FIELDS.some((f) => {
    const el = document.getElementById(fieldId(card, f)) as HTMLTextAreaElement | null;
    const value = el?.value.trim() ?? "";
    return f === "commercialDisclosure" ? value !== "" && value !== DEFAULT_DISCLOSURE : value !== "";
  });
}

function initialCards(presenters: Partial<ApplicationData>["presenters"]): Card[] {
  // A failed save echoes the raw slice, which can hold nulls for dropped values.
  const saved = (Array.isArray(presenters) ? presenters : []).slice(
    0,
    MAX_PRESENTERS,
  );
  if (saved.length === 0) return [{ key: 0, savedIndex: 0, initial: {} }];
  return saved.map((p, i) => ({
    key: i,
    savedIndex: i,
    initial: p && typeof p === "object" ? p : {},
  }));
}

export function PresentersFields({
  presenters,
  errors = {},
}: {
  presenters: Partial<ApplicationData>["presenters"];
  errors?: FieldErrors;
}) {
  const [cards, setCards] = useState(() => initialCards(presenters));
  const addButton = useRef<HTMLButtonElement>(null);
  const nextKey = useRef(cards.length);
  // The card just added, focused once it has rendered.
  const focusKey = useRef<number | null>(null);

  useEffect(() => {
    if (focusKey.current === null) return;
    document.getElementById(`presenter-card-${focusKey.current}-name`)?.focus();
    focusKey.current = null;
  }, [cards]);

  function addCard() {
    // Not `nextKey.current++`: the React Compiler output reads the ref after
    // the increment, which skipped a key.
    const key = nextKey.current;
    nextKey.current = key + 1;
    focusKey.current = key;
    setCards((cs) => (cs.length >= MAX_PRESENTERS ? cs : [...cs, { key, initial: {} }]));
  }

  function removeCard(card: Card, title: string) {
    if (cardHasInput(card) && !window.confirm(`Remove ${title}? What you typed for them will be discarded.`)) {
      return;
    }
    setCards((cs) => cs.filter((c) => c.key !== card.key));
    // The clicked button unmounts with its card; keep keyboard users in place.
    addButton.current?.focus();
  }

  return (
    <>
      {/* Array-level errors (.min(1) / .max(8)) have nowhere else to land. */}
      <FieldError messages={errors.presenters} />
      {cards.map((card, i) => (
        <PresenterCard
          key={card.key}
          card={card}
          position={i}
          errors={errors}
          onRemove={i === 0 ? undefined : (title) => removeCard(card, title)}
        />
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button
          ref={addButton}
          type="button"
          onClick={addCard}
          disabled={cards.length >= MAX_PRESENTERS}
          className="rounded-md border border-border bg-white px-4 py-2 text-[12px] font-semibold text-navy transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add another presenter
        </button>
        <p className="text-[11px] text-text-muted">
          {cards.length >= MAX_PRESENTERS
            ? `You have reached the limit of ${MAX_PRESENTERS} presenters.`
            : `Add each co-presenter or moderator (up to ${MAX_PRESENTERS} presenters in total).`}
        </p>
      </div>
    </>
  );
}

function PresenterCard({
  card,
  position,
  errors,
  onRemove,
}: {
  card: Card;
  position: number;
  errors: FieldErrors;
  onRemove?: (title: string) => void;
}) {
  const isPrimary = position === 0;
  const p = card.initial;
  // Names follow the card's current position (what the server reads); ids
  // follow the card itself (what labels, focus and error anchors target).
  const fieldName = (f: string) => `presenter_${position}_${f}`;
  const id = (f: string) => fieldId(card, f);
  const err = (f: string) =>
    card.savedIndex === undefined ? undefined : errors[`presenter_${card.savedIndex}_${f}`];

  const role =
    typeof p.role === "string" && (ADDED_ROLES as readonly string[]).includes(p.role)
      ? p.role
      : ADDED_ROLES[0];
  const nameId = id("name");
  const title = isPrimary ? PRIMARY_ROLE : `Presenter ${position + 1}`;

  return (
    <FormCard
      title={title}
      action={
        onRemove ? (
          // Padding + negative margin: a thumb-sized target that doesn't
          // change the title row's height.
          <button
            type="button"
            onClick={() => onRemove(title)}
            aria-label={`Remove ${title}`}
            className="-my-2 -mr-2 rounded px-3 py-2 text-[11px] font-semibold text-red-600 hover:bg-red-50 hover:underline"
          >
            Remove
          </button>
        ) : undefined
      }
    >
      <FormField>
        <FormLabel required htmlFor={nameId}>
          Presenter Name
        </FormLabel>
        <FormInput
          id={nameId}
          name={fieldName("name")}
          defaultValue={p.name ?? ""}
          required
          minLength={2}
          maxLength={200}
          aria-invalid={err("name") ? true : undefined}
        />
        <FieldError messages={err("name")} />
      </FormField>
      <FormField>
        {isPrimary ? (
          <>
            {/* Static text, not a <label>: there is no control to label. */}
            <p className="mb-1.5 text-[11px] font-semibold text-text-mid">Role</p>
            <p className="py-2 text-[13px] text-text-mid">{PRIMARY_ROLE}</p>
          </>
        ) : (
          <>
            <FormLabel required htmlFor={id("role")}>
              Role
            </FormLabel>
            <FormSelect
              id={id("role")}
              name={fieldName("role")}
              defaultValue={role}
              options={ADDED_ROLES}
            />
            <FieldError messages={err("role")} />
          </>
        )}
      </FormField>
      <FormField fullWidth>
        <FormLabel required htmlFor={id("commercialDisclosure")}>
          Commercial Disclosure
        </FormLabel>
        <CountedTextarea
          id={id("commercialDisclosure")}
          name={fieldName("commercialDisclosure")}
          defaultValue={p.commercialDisclosure ?? DEFAULT_DISCLOSURE}
          required
          minLength={2}
          max={1000}
          invalid={Boolean(err("commercialDisclosure"))}
        />
        <FieldError messages={err("commercialDisclosure")} />
      </FormField>
      <FormField fullWidth>
        <FormLabel
          required
          htmlFor={id("experience")}
          hint="Last Name, First Name, experience relative to course matter"
        >
          Experience Relative to Course Matter
        </FormLabel>
        <CountedTextarea
          id={id("experience")}
          name={fieldName("experience")}
          defaultValue={p.experience ?? ""}
          required
          minLength={2}
          max={1000}
          invalid={Boolean(err("experience"))}
        />
        <FieldError messages={err("experience")} />
      </FormField>
      <FormField fullWidth>
        <FormLabel
          required
          htmlFor={id("training")}
          hint="How much time, and a description: live, paper, or digital?"
        >
          Training Received by Presenter
        </FormLabel>
        <CountedTextarea
          id={id("training")}
          name={fieldName("training")}
          defaultValue={p.training ?? ""}
          required
          minLength={2}
          max={1000}
          invalid={Boolean(err("training"))}
        />
        <FieldError messages={err("training")} />
      </FormField>
      <FormField fullWidth>
        <FormLabel required htmlFor={id("bio")} hint="Include name and title">
          Presenter Bio
        </FormLabel>
        <CountedTextarea
          id={id("bio")}
          name={fieldName("bio")}
          defaultValue={p.bio ?? ""}
          required
          minLength={2}
          max={2000}
          invalid={Boolean(err("bio"))}
        />
        <FieldError messages={err("bio")} />
      </FormField>
    </FormCard>
  );
}
