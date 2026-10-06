/*
  Strict argument parsing for scripts/merge-smile-together-certs.ts. Anything
  unrecognised is an error: "--only a@b.c" (space instead of "=") must never
  fall back to "email everyone".
*/

export type MergeMode = "dry-run" | "rehearse" | "apply" | "send-emails";

export type MergeArgs = {
  mode: MergeMode;
  /** --send-emails: restrict to one recipient (their primary email, lowercased). */
  only: string | null;
  /** --send-emails: deliver every selected email to this address instead. */
  testTo: string | null;
};

const MODE_FLAGS: Record<string, MergeMode> = {
  "--rehearse": "rehearse",
  "--apply": "apply",
  "--send-emails": "send-emails",
};

export function parseMergeArgs(argv: string[]): MergeArgs {
  const modes: MergeMode[] = [];
  let only: string | null = null;
  let testTo: string | null = null;

  for (const arg of argv) {
    if (arg in MODE_FLAGS) {
      modes.push(MODE_FLAGS[arg]);
    } else if (arg.startsWith("--only=")) {
      only = arg.slice("--only=".length).trim().toLowerCase();
      if (!only) throw new Error("--only needs a value: --only=<primary email>");
    } else if (arg.startsWith("--test-to=")) {
      testTo = arg.slice("--test-to=".length).trim().toLowerCase();
      if (!testTo) throw new Error("--test-to needs a value: --test-to=<email>");
    } else {
      throw new Error(`Unrecognised argument "${arg}". Values are written with "=", for example --only=<email>.`);
    }
  }

  if (modes.length > 1) throw new Error("Use one of --rehearse, --apply or --send-emails at a time.");
  const mode = modes[0] ?? "dry-run";
  if ((only !== null || testTo !== null) && mode !== "send-emails") {
    throw new Error("--only and --test-to are only valid with --send-emails.");
  }
  return { mode, only, testTo };
}
