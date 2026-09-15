# Integration test fixtures

`npm test` generates one `.code-workspace` per case into `.generated/`, opens each in a downloaded
VS Code with the released Server Manager installed alongside, and runs the suite in `src/test/suite`
against two IRIS containers ([iris/docker-compose.yml](iris/docker-compose.yml)):

| Container   | Port  | `/api/atelier` authentication   |
| ----------- | ----- | ------------------------------- |
| `named`     | 52799 | password only (`_SYSTEM`/`SYS`) |
| `anonymous` | 52798 | unauthenticated only            |

Both run [iris/setup/setup.sh](iris/setup/setup.sh) after IRIS starts, which sets a 10-second
`/api/atelier` session timeout so expired-session recovery can be tested.

## Cases

One `.code-workspace` per case, one folder per workspace; `-named` and `-anonymous` pick the container.

| Case                   | `folders[·]`                           | `objectscript.conn` (folder)                               | `intersystems.servers` (workspace)                                                    |
| ---------------------- | -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `clientSide-os-host`   | `{ path }`                             | `{ https, host, port, ns, ...credentials, ...active }`     | `{}`                                                                                  |
| `clientSide-os-docker` | `{ path }`                             | `{ docker-compose, ns, active: true, ...credentials }`     | `{}`                                                                                  |
| `clientSide-sm`        | `{ path }`                             | `{ server: <serverName>, ns, ...active }`                  | `{ <serverName>: { webServer: { scheme, host, port, pathPrefix }, ...credentials } }` |
| `serverSide-sm`        | `{ uri: "isfs://<serverName>:<ns>/" }` | `{}`                                                       | `{ <serverName>: { webServer: { scheme, host, port, pathPrefix }, ...credentials } }` |

### Variants

Each case is launched once per applicable combination; the variant names are appended to the case name.

`...credentials` — where the case's address lives (`objectscript.conn` for `*-os-*`, the entry for `*-sm`):

- `-named`: `{ username, password }`
- `-anonymous`: `{}`; the server must allow unauthenticated access

The containers run under Podman (`podman-compose -f test-fixtures/iris/docker-compose.yml up`), so `clientSide-os-docker` resolves through Podman too.

`...active` — `clientSide-os-host` and `clientSide-sm` only. A `docker-compose` connection must set `active: true` (the extension skips resolving an inactive connection), so it has no inactive variant:

- `-active`: `{ active: true }`
- `-inactive`: `{}` (default `false`)

2 × 2 × 2 + 2 × 2 = 12 launches. Both repos run all of them, each installing the other extension's Marketplace release.

### Checks

Each is a mocha test, run in this order. A credential prompt anywhere fails the case.

1. **resolves** — `asyncServerForUri` reports `active`, host, port, ns, username, password as configured
2. **round-trips** — depending on `active` (`serverSide-` and `clientSide-os-docker` are always active):
    - active: save class → on server (direct REST) → delete → gone
    - inactive: save class → never reaches the server
3. **lists the namespace** (`serverSide-` only) — `readDirectory` on the folder root is non-empty
4. **Server Manager resolves the spec** — `getServerSpec` reports `webServer` fields, username, password as configured; `auth.resolved()` iff `-named`. Looked up by `<serverName>` for `*-sm`, by folder name (the Servers view's Current node) for `*-os-*`
5. **Server Manager lists namespaces** (Server Manager repo only) — `makeRESTRequest("GET", spec)` → 200 with `USER` listed, as the Servers view does
6. **still resolves and round-trips after the session times out** — 1 and 2 again after idling past the timeout, without the delete
7. **flipping `objectscript.conn.active` is honored** (`clientSide-os-host`, `clientSide-sm` only) — 1 and 2 again with `active` flipped, then restored, without the delete

## Running

In CI this runs from [.github/workflows/prepare-release.yml](../.github/workflows/prepare-release.yml),
on PRs whose source branch starts with `prepare-` and on manual dispatch. To run locally with Podman:

```sh
podman-compose -f test-fixtures/iris/docker-compose.yml up -d --wait
npm test
podman-compose -f test-fixtures/iris/docker-compose.yml down -v
```
