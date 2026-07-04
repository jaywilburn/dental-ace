import "server-only";

/*
  Set-password token, app/server-side entrypoint. The implementation lives in
  ./set-password-token-core (which has NO "server-only" guard) so batch scripts
  run via tsx can mint the exact same token this app verifies. This module
  re-exports it behind the server-only guard for route/server imports; the
  consuming route (/api/auth/set-password) and admin invite flow import from here.
*/

export {
  SET_PASSWORD_MAX_AGE_SECONDS,
  signSetPasswordToken,
  verifySetPasswordToken,
} from "./set-password-token-core";
