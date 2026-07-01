/*
  Shared sign-up role declaration. The public /signup page asks "what brings you
  here?" and carries the answer in the `?as=` param (display-only: it tailors the
  copy + optional license fields). The register route reads the same value back
  off the posted form so an error redirect can return the user to the right
  variant of the form (instead of the role-chooser) with the real message.
*/

export type SignupRole = "individual" | "company" | "staff";

export function isValidSignupRole(as: string | undefined | null): as is SignupRole {
  return as === "individual" || as === "company" || as === "staff";
}
