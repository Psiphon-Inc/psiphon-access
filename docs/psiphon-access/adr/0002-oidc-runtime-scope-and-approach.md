# ADR 0002. Scope and approach for the fork OIDC runtime

**Status: accepted. The decision holds. The supporting text is historical.**

This record chose Approach 1, reuse the OIDC connector model and add a localized
server runtime, and chose to deliver browser login and CLI login together. The
fork does both today.

Read it for WHY the scope is what it is. Do not read it for WHERE code goes. Its
"expected touched existing files" and "candidate new files" sections list a
seventeen-file layout that was abandoned. The layout the fork actually uses is in
`../source-provenance.md`.

The admin UX scope it defers is still deferred. There is no web UI for editing a
Google connector, and `tctl` remains the way to create one. The `tctl` Google
preset it discusses was never built.

---


## Goal and constraints

The goal is **not** merely to make Google login work once.
The goal is to choose the path with the best long-term maintenance profile:

- keep the merge/rebase surface as small as possible
- localize as much new behavior as possible in **new files**
- reuse upstream abstractions that already exist in the AGPL tree
- avoid building a large fork-only UI/admin surface unless it is truly needed
- use the visible GitHub flow as a reference for wiring patterns, not necessarily as a feature model to duplicate wholesale

## Key observation

The browser and `tsh` clients already look more generic than the visible server-side implementation.

### Browser side is already generic enough

The login UI already knows how to:

- read OIDC providers from `/web/config.js`
- build `/v1/webapi/oidc/login/web?...` URLs
- perform identifier-first matching against OIDC connectors

Relevant files:

- `lib/web/apiserver.go` → `getWebConfig`, `getUserMatchedAuthConnectors`
- `api/client/webclient/webconfig.go`
- `web/packages/teleport/src/Login/useLogin.ts`
- `web/packages/teleport/src/config.ts`
- `web/packages/teleport/src/components/FormLogin/FormIdentifierFirst.tsx`

### `tsh` is also already generic enough

The CLI login path already posts to a generic connector-type route:

- `lib/client/sso.go` → `POST /webapi/<connectorType>/login/console`

That means `tsh` likely does **not** need a fork-specific Google client implementation if the proxy exposes the expected OIDC console-login endpoint.

### The missing surface is mostly server-side

The biggest gaps visible in this AGPL checkout are on the server side:

- no visible OIDC proxy routes for web login / callback / console login
- no visible auth HTTP validation route for OIDC callback validation
- no visible non-test `OIDCService` runtime implementation

So the smallest-maintenance path is likely:

1. reuse the **existing OIDC connector model**
2. reuse existing browser / `tsh` generic behavior
3. add the **minimum missing proxy/auth runtime wiring**
4. avoid large frontend/admin changes at first

## Approach 1 — Recommended: reuse OIDC connector model, add localized server runtime, use `tctl` for admin flow

## Summary

Use the existing OIDC connector resource and Google preset.
Do the smallest amount of work needed to make:

- Google-backed OIDC connector creation work via `tctl`
- browser login work
- `tsh` login work

But **do not** add full OIDC/SAML connector management to the OSS web UI in v1.

This gives the smallest long-term merge surface while staying aligned with upstream abstractions.

## Why this is the best fit for the stated goal

It maximizes reuse of what already exists:

- existing OIDC connector resource type
- existing Google-specific connector fields
- existing `tctl sso configure oidc --preset google`
- existing web-config provider discovery
- existing generic browser login flow
- existing generic `tsh` SSO initiation flow
- existing redirect-validation helpers

And it avoids the biggest unnecessary fork surface:

- new resource kinds
- new frontend CRUD/editor flows
- custom Google-only UI concepts

## Recommendation

For the stated goal — **small merge surface, localized code, minimal maintenance** — the best path is:

1. **Stay on the existing OIDC connector model**
2. **Use `tctl`/YAML as the initial admin workflow**
3. **Add the missing OIDC server-side runtime in new files**
4. **Touch existing files only where route registration, startup wiring, or narrow auth gating requires it**
5. **Ship browser + `tsh` support before attempting OIDC/SAML connector web CRUD**

If you want the lowest-risk execution order while keeping that architecture, use a staged version of the same plan:

- first prove browser login end-to-end
- then add CLI login
- only later decide whether OIDC/SAML connector web management is worth the maintenance cost
