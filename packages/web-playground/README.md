# @phantomguard/web-playground

The haunted face of PhantomGuard: a static, fully client-side single-page app built with Vite, React and Tailwind CSS v4. It compiles the engine from source (`packages/core-engine/src`), so the dev server needs no prior engine build and edits to the engine hot-reload.

```bash
npm run dev -w @phantomguard/web-playground      # or `npm run dev` at the repository root
npm run build:web                                  # writes packages/web-playground/dist
```

## Two modes

| Mode | Source of resources | You can |
| --- | --- | --- |
| **Inspect Haunted Cloud** | Fictional AWS accounts from the engine's datasets | See the dashboard, open a resource in the drawer, read its estimated CVSS score and risk, compare vulnerable and hardened side by side, perform an exorcism (with a confirmation for review-required fixes), reset |
| **Scan Custom Config** | Terraform, a Dockerfile or an IAM policy that you paste or drop | See the offending lines, diagnostics, the scan time and a side-by-side diff of each fix; copy the hardened text or the diff |

The mode follows the URL fragment (`#inspector`, `#scanner`). Both panels stay mounted, so each keeps its state while you visit the other.

## Design rules

The full contract is in [`.kiro/steering/product.md`](../../.kiro/steering/product.md) and [`tech.md`](../../.kiro/steering/tech.md). The ones that code must keep:

- Page background `bg-slate-950`; panels are `glass-panel` (translucent slate-900 with a blur).
- **Neon red** (`--color-neon-red`) means a problem and **neon green** (`--color-neon-green`) means safe. Nothing else uses them. Violet is neutral chrome.
- Severity is never color alone: an icon, a text label and a color.
- Text contrast was measured. Never use `text-slate-500` or darker on a dark surface; on tinted diff rows keep text `slate-200` and put the color in the border and the `+`/`-` sign.
- Animations sit behind `motion-safe:`; a `prefers-reduced-motion` block stops the rest.
- System fonts only. The Content-Security-Policy allows no outbound origin, and the page makes no request after it loads: the scan worker is bundled inline (`?worker&inline`).
- User text is rendered as text, never as HTML. Pasted configuration is kept in memory only.

## Layout

```text
src/
├── main.tsx, App.tsx, index.css     entry, shell, Tailwind theme tokens
├── modes/                           HauntedCloudInspector.tsx, CustomConfigScanner.tsx
├── components/                      ModeTabs, ResourceCard, FindingCard, DiffView, SourceExcerpt,
│                                    SeverityBadge, HauntingMeter
├── workers/                         scan.worker.ts, scan-protocol.ts
└── lib/                             scan-client.ts, useScanClient.ts, useSessionState.ts,
                                     lexicon.ts, severity-style.ts, samples.ts
```
