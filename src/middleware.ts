export { default } from "next-auth/middleware";

/**
 * Redirects signed-out users to /login for every app route below.
 * API routes enforce auth themselves via withUser().
 */
export const config = {
  matcher: ["/dashboard/:path*", "/case/:path*", "/account/:path*"],
};
