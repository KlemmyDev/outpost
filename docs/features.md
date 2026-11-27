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

## Server-side parts (next)

Features with background work, such as the MeshCore radio bridge or reading
WattsMyPower, will add a `server.ts` with `migrations` (applied in their own
namespace by `migrate(db, '<id>', migrations)`) and `start()`/`stop()` hooks
that the platform calls as the feature is switched on and off. The database
already keeps a separate migration version per namespace, so features can be
added and removed without renumbering anyone else's migrations.
