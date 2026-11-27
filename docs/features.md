# Feature modules

Everything Outpost does beyond the platform itself is a **feature module** that
can be switched on or off: the library, first aid, the map, mesh messages,
power and emergency plans. Switching one off removes it from the menu and its
pages return "not found", for everyone at home.

## How a feature is put together

```
src/features/<id>/
  manifest.ts     what it is: name, code, path, icon, default, requirements
  Page.tsx        its screen (or screens)
src/routes/<id>.tsx  the route, guarded with requireFeature('<id>')
```

The manifest (see `src/platform/features/types.ts`):

```ts
export const manifest: FeatureManifest = {
  id: 'first-aid',            // used in settings, .env and URLs
  name: 'First aid',          // friendly name in menus
  code: 'AID STATION',        // tactical code in tags and logs
  description: 'Australian first aid guidance and WikiMed…',
  path: '/first-aid',
  icon: 'M4 4h16v16H4zM12 8v8M8 12h8',  // 24×24 stroke path
  order: 20,
  defaultEnabled: true,
  requires: ['library'],      // off while the library is off
}
```

## Adding a feature

1. Create `src/features/<id>/manifest.ts` and `Page.tsx`.
2. Add the manifest to `FEATURES` in `src/platform/features/registry.ts`.
3. Add `src/routes/<id>.tsx`:

   ```tsx
   export const Route = createFileRoute('/<id>')({
     beforeLoad: requireFeature('<id>'),
     component: MyPage,
   })
   ```

4. `npm test` checks the manifests are valid: unique ids, known requirements.

Sub-pages go in `src/routes/<id>/…` and each uses the same `requireFeature`.
API routes for a feature go in `src/routes/api/<id>/…` and should check
`getPlatform().features.isEnabled('<id>')` and answer 404 when it's off.

## A card on the Overview

A feature can add a card to the Overview, with details that slide in when
it's tapped:

```
src/features/<id>/overview.tsx   export const widget: OverviewWidget = { Card, Detail }
```

List it in `WIDGETS` in `src/platform/features/widgets.ts`. Cards use
`SummaryCard` (a label, one answer, one visual, one line). Details go in the
`Sheet` the Overview opens for you.

If the card needs live data from the server:

1. add its type to `WidgetData` in `src/platform/overview.types.ts`
2. add a loader to `LOADERS` in `src/platform/server/widgets.server.ts`

Loaders only run while the feature is on, and a failing loader gives the card
`null` instead of breaking the Overview. The Internet feature is the example
to copy: `internet.server.ts` does the work, `overview.tsx` shows it.

## Who decides what's on

From highest priority to lowest:

| Source | Example | Can it be changed in Settings? |
| --- | --- | --- |
| Core | Overview, Settings | No, always on |
| `.env` | `OUTPOST_FEATURES=messages,-power` | No, locked by the server's owner |
| Settings | the switches in Settings › Features | Yes |
| Default | `defaultEnabled` in the manifest | Yes |

A feature whose requirements are off is off too, all the way down a chain. The
settings screen says which feature it's waiting for. Its own switch keeps
your choice, so it comes back when the requirement does.

## Background work

A feature that runs on its own (probes, a radio bridge, polling WattsMyPower)
exports a `FeatureServer` from `src/features/<id>/server.ts` and lists it in
`src/platform/server/feature-servers.server.ts`:

```ts
export const server: FeatureServer = {
  migrations: MIGRATIONS,     // run in the "<id>" namespace before start()
  start(ctx) { … },           // ctx: db, settings, notify, log
  stop() { … },
}
```

The platform starts it at boot if the feature is on, and starts or stops it
the moment the feature is switched on or off in Settings. Each feature keeps
its own migration version, so features can be added and removed without
renumbering anyone else's. Keep timers `unref()`'d so they never hold the
process open.

`ctx.notify({ level, title, body })` sends a notification: it appears under
the bell in the header and, for warnings and alerts by default, goes to ntfy
and the webhook set in Settings › Notifications.

The Internet feature is the full example: `server.ts` → `monitor.server.ts`
(scheduling and the outage detector) → `probe.server.ts`,
`speedtest.server.ts`, `store.server.ts`, with the pure logic in `analyze.ts`
covered by `tests/internet-analyze.test.ts`.
