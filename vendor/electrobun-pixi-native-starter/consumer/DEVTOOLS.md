# Native DevTools and MCP

Register an existing app with `attachNativeDevtools(app, {name, build, isolated,
enabled, state})`, exported by `src/native-host`. The optional state callback
supplies application-specific diagnostics. Use `enabled:false` or
`PIXI_AGENT_DEBUG=0` in production.

The CLI and MCP share one loopback-only authenticated core. Each live instance
has its own registration and random bearer credential. Instance listing omits
credentials and verifies the server identity. Old instances cannot remove new
registrations. The legacy discovery file remains for the existing Demo CLI only.

## Usage

```sh
npm run devtools:cli -- list
npm run devtools:cli -- status INSTANCE_ID
npm run devtools:cli -- command INSTANCE_ID '{"action":"inspect","target":{"label":"my-control"}}'
```

For MCP, install the checkout's locked development dependencies and run
`node /absolute/starter/path/tools/devtools-mcp.mjs` as a stdio server. No output
except MCP protocol messages is sent to stdout. List instances, select one, and
read capabilities before acting. Duplicate labels are errors; use the node ID.
IDs belong to one node lifetime, so destroyed nodes cannot target replacements.

Tools cover instance selection, runtime status, scene tree/inspection, hit tests,
evidence, timed replay/cancel, frame control, waits, events, watches and textures.
The existing `debug:pixi` command retains Demo-specific OS-input and fault tests.
There is no arbitrary JavaScript evaluation tool.

## Evidence semantics

- Metadata and diagnostic GPU re-render submission occur synchronously inside a
  successful presented callback. `source:diagnostic-rerender` and
  `afterPresentedFrame` identify the sample. It is not an OS screenshot or a
  byte-for-byte copy of the preceding swapchain image, and excludes OS dialogs.
- Evidence contains PNG/JSON, selected nodes, application state, frame counters,
  generations and bounded events. State providers must omit secrets. MCP returns
  artifact metadata instead of inline images larger than 12 MiB.
- Input replay injects native events with independent touch IDs. It is not a
  physical hardware proof. Sequences are prevalidated and bounded; all pointers
  must be released and are canceled on runtime failure or external cancellation.
- Watches retain 120 presented-state frames plus a bounded post-trigger window;
  maximum eight watches. They record state, not video.
- Pause stops rendering. Only a registered application clock can also be paused
  or advanced; OS events, IO and unregistered timers keep running.
- Visibility inspection explains flags and ancestor alpha. Mask coverage,
  transparent texels and occlusion still need pixels. Actual fallback fonts are
  marked unavailable where Skia cannot expose their identity.
- Resource inspection covers scene-reachable textures, not renderer pools or
  total process GPU memory.

## Validation

```sh
npm run typecheck
bun test src/diagnostics/devtools.test.ts
node tools/devtools-mcp.test.mjs
```

The last command uses the official MCP client over actual stdio, checking
discovery, selection, credential redaction, command dispatch and schema errors.
