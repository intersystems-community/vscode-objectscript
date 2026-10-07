# Integration test fixtures

`npm test` generates one `.code-workspace` per case, plus the empty client folder they share, into
`.generated/`, opens each in a downloaded VS Code alongside the released Server Manager, and runs
`src/test/suite` against two IRIS containers ([iris/docker-compose.yml](iris/docker-compose.yml)):

| Container   | Port  | `/api/atelier` authentication   |
| ----------- | ----- | ------------------------------- |
| `named`     | 52799 | password only (`_SYSTEM`/`SYS`) |
| `anonymous` | 52798 | unauthenticated only            |

[iris/setup/setup.sh](iris/setup/setup.sh) also sets a 10-second `/api/atelier` session timeout.

## Cases

One folder per workspace. The `-named`/`-anonymous` suffix picks the container and supplies
`...credentials`: `{ username, password }` or `{}`.

| Case                   | `folders[·]`                           | `objectscript.conn` (folder)                               | `intersystems.servers` (workspace)                                                    |
| ---------------------- | -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `clientSide-os-host`   | `{ path }`                             | `{ https, host, port, ns, ...credentials, ...active }`     | `{}`                                                                                  |
| `clientSide-os-docker` | `{ path }`                             | `{ docker-compose, ns, active: true, ...credentials }`     | `{}`                                                                                  |
| `clientSide-sm`        | `{ path }`                             | `{ server: <serverName>, ns, ...active }`                  | `{ <serverName>: { webServer: { scheme, host, port, pathPrefix }, ...credentials } }` |
| `serverSide-sm`        | `{ uri: "isfs://<serverName>:<ns>/" }` | `{}`                                                       | `{ <serverName>: { webServer: { scheme, host, port, pathPrefix }, ...credentials } }` |

`clientSide-os-host` and `clientSide-sm` also come as `-active` (`{ active: true }`) and `-inactive`
(`{}`); a `docker-compose` connection is only resolved when active, so `clientSide-os-docker` has no
variant. 12 launches in all.

## Checks

OS is the ObjectScript extension, SM Server Manager. Each check runs twice, the second time after
idling past the session timeout; `-active`/`-inactive` cases then run them all once more with `active`
flipped. A credential prompt fails the case.

1. **OS resolves** (`checkOSResolves`) — `asyncServerForUri` reports `active`, host, port, ns and credentials as configured
2. **SM resolves** (`checkSMResolves`) — `getServerSpec` reports the same; `auth.resolved()` iff `-named`. Keyed by `<serverName>` for `*-sm`, by folder name for `*-os-*`
3. **OS lists the folder** (`checkOSListsTheFolder`; `serverSide-` only) — `readDirectory` on the isfs root is non-empty
4. **SM lists namespaces** (`checkSMListsNamespaces`; SM repo only) — `makeRESTRequest("GET", spec)` → 200 listing `USER`
5. **round-trips** (`checkRoundTrips`) — save a class; active: it appears on the server (direct REST) and goes on delete; inactive: it never arrives

## Running

CI: [prepare-release.yml](../.github/workflows/prepare-release.yml), on `prepare-*` PRs and manual
dispatch. Locally:

```sh
podman-compose -f test-fixtures/iris/docker-compose.yml up -d --wait
npm test                # or a subset: npm test -- os-host
podman-compose -f test-fixtures/iris/docker-compose.yml down -v
```
