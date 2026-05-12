/**
 * Canonical runtime semver for the app UI and `.slinker` file `version` field.
 *
 * Source of truth: `package.json`. Wired at build time by `vite.config.ts`
 * (`define.__APP_VERSION__`). Vitest mirrors this in `vitest.config.ts`.
 *
 * Import `APP_VERSION` here everywhere you need to show or persist the app version.
 */
declare const __APP_VERSION__: string;

export const APP_VERSION = __APP_VERSION__;
