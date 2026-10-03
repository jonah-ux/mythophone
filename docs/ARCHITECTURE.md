# Starter architecture

A single Vite/React/TypeScript application with independent npm dependencies and a lockfile. Zod validates versioned sample and import formats. No application server, account system, credential, or provider request is included.

`src/domain.ts` owns preset/note validation; `src/audio.ts` owns the real audio graph and voice lifecycle; `src/presets.json` contains original prepared presets; `src/App.tsx` owns performance controls.

## Future AI seam

Add a thin server-side adapter behind a tested request/response format when beginning the AI slice. The product engine owns effects and state; a model proposes bounded data. Timeouts, unsupported output, and cancellation must preserve the current usable experience. Credentials must not become VITE_ variables or committed artifacts.

## Scope

This starter does not implement the complete docs/BUILD-PROMPT.md. docs/NEXT-STEPS.md lists the remaining work. A local dev server is not a public deployment.
