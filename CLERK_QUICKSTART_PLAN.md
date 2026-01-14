# Clerk React Quickstart Integration Plan (Ordersight FE)

Reference: https://clerk.com/docs/react/getting-started/quickstart
Secondary reference: `clerk-security-architecture.md`

## What the security architecture clarifies

- **Bearer JWTs, not cookies**: React should call the API with `Authorization: Bearer <Clerk JWT>`.
- **No true BFF sessions**: do not build a separate app session store.
- **No token persistence**: never store tokens in `localStorage`/`sessionStorage`.
- **Clerk Organizations are the tenant boundary**: org context matters for all org-scoped calls.
- **CSRF handling can be removed** if the API is purely bearer-token based.

## Updated assumptions from you

- **Single-organization per user**: do not expose org switching in the UI.
- **Org context uses path params**: API calls should include `:orgId` in the URL.
- **Simplify with Clerk**: remove existing auth flows and supporting code/tests.

## Questions to answer first

- Should the app later introduce a “create organization” step for new users, or stay with the direct `/dashboard` landing?

## Plan (aligned to Clerk Quickstart + architecture)

1. **Quickstart baseline setup**
   - Ensure `@clerk/clerk-react` is installed and `VITE_CLERK_PUBLISHABLE_KEY` is set (Quickstart step 1).
   - In `ordersight-fe/src/main.tsx`, keep `<ClerkProvider>` as the top-level wrapper and align router wiring with the Quickstart example.

2. **Replace custom auth routes with Clerk UI**
   - Update `ordersight-fe/src/routes.tsx` so `/sign-in` and `/sign-up` render `<SignIn />` / `<SignUp />` (Quickstart step 2).
   - Remove the existing custom auth pages in `ordersight-fe/src/pages/auth/*` once the Clerk pages are live.
   - **Why**: this eliminates custom auth flows (password, OAuth, MFA) that Clerk already provides and secures.

3. **Protect routes using Clerk primitives**
   - Replace Zustand-based auth in `ordersight-fe/src/layout/AuthenticatedLayout.tsx` with `<SignedIn>`, `<SignedOut>`, and `<RedirectToSignIn />` (Quickstart step 3).
   - Add `<UserButton />` to the nav for account controls.
   - **Why**: state is already managed by Clerk; local auth state is redundant and risks divergence.

4. **Cull local auth state + services**
   - Remove `ordersight-fe/src/stores/authStore.ts`, `ordersight-fe/src/services/auth.ts`, and dependent hooks/types/tests.
   - Remove `initializeAuth()` and the `setOnUnauthorized` redirect tied to local session logic.
   - **Why**: these files implement a bespoke auth/session model that is replaced by Clerk’s session handling.

5. **Update API client to use Clerk JWTs (path param org)**
   - Add a request interceptor in `ordersight-fe/src/services/http.ts` that calls `getToken()` from Clerk and sets `Authorization: Bearer <token>`.
   - Update API calls to include org context via path params (e.g., `/api/organizations/:orgId/...`).
   - Remove CSRF token fetching and retry logic from `ordersight-fe/src/services/http.ts` once the backend no longer uses cookies.
   - **Why**: bearer tokens eliminate CSRF and align with the architecture; org is derived from path params per your preference.

6. **Single-organization flow**
   - After sign-in, fetch the user’s organization and route directly to `/dashboard`.
   - Do **not** render `OrganizationSwitcher` or org selection UI.
   - Store the org ID in React state and use it for all org-scoped API calls.
   - **Why**: your product model disallows multi-org membership even if Clerk supports it.

7. **Update entry points and UI**
   - Update `ordersight-fe/src/pages/Home.tsx` to use `<SignedIn>` / `<SignedOut>` and route to Clerk URLs.
   - Remove custom OAuth buttons in favor of Clerk-configured providers.
   - **Why**: prevents split login experiences and reduces maintenance.

8. **Tests + documentation**
   - Remove or update auth tests in `ordersight-fe/src/pages/auth/__tests__/*` and `ordersight-fe/src/features/auth/__tests__/*`.
   - Update router tests to render within `ClerkProvider` and use Clerk test helpers/mocks.
   - Update `ordersight-fe/README.md` to reference Clerk Quickstart and summarize local auth setup.

## What gets removed or changed (and why)

- **Custom auth pages** (`ordersight-fe/src/pages/auth/*`): replaced by Clerk SignIn/SignUp components.
- **Auth store + services** (`ordersight-fe/src/stores/authStore.ts`, `ordersight-fe/src/services/auth.ts`): no longer needed; Clerk handles sessions.
- **Auth types and hooks** (`ordersight-fe/src/types/auth.ts`, `ordersight-fe/src/features/auth/*`): tied to the old auth API; remove to avoid confusion.
- **CSRF handling in HTTP client** (`ordersight-fe/src/services/http.ts`): remove if using bearer tokens only.
- **401 redirect handler** (`setOnUnauthorized`): not needed; Clerk handles signed-out state.
- **Org selection UX**: omitted due to single-org constraint.

## Files likely to change or retire

- `ordersight-fe/src/main.tsx`
- `ordersight-fe/src/routes.tsx`
- `ordersight-fe/src/layout/AuthenticatedLayout.tsx`
- `ordersight-fe/src/pages/Home.tsx`
- `ordersight-fe/src/pages/auth/*` (remove)
- `ordersight-fe/src/stores/authStore.ts` (remove)
- `ordersight-fe/src/services/auth.ts` (remove)
- `ordersight-fe/src/services/http.ts`
- `ordersight-fe/src/features/auth/*` (remove)
- `ordersight-fe/src/types/auth.ts` (remove)
- `ordersight-fe/src/**/__tests__/*` (update/remove)
- `ordersight-fe/README.md`

## Validation checklist

- Sign-in/sign-up work via Clerk and redirect to expected post-auth route.
- Protected routes render only when signed in; signed-out users go to Clerk sign-in.
- API requests include a valid Clerk JWT in `Authorization`.
- Org ID is sourced once and applied to org-scoped API path params.
- Legacy auth code and pages are fully removed or deprecated.
