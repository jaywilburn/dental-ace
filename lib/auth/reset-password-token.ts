import "server-only";

/*
  Password-reset token, app/server-side entrypoint. The implementation lives in
  ./reset-password-token-core (which has NO "server-only" guard) so the unit test
  can import it directly. This module re-exports it behind the server-only guard
  for route imports; the request (/api/auth/request-password-reset) and consume
  (/api/auth/reset-password) routes import from here.
*/

export {
  RESET_PASSWORD_MAX_AGE_SECONDS,
  signResetPasswordToken,
  verifyResetPasswordToken,
} from "./reset-password-token-core";
