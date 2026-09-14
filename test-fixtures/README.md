# Integration test fixtures

`npm test` generates one `.code-workspace` per case (see [CASES.md](CASES.md)) into `.generated/`,
opens each in a downloaded VS Code with the released Server Manager installed alongside, and runs the
suite in `src/test/suite` against two IRIS containers ([iris/docker-compose.yml](iris/docker-compose.yml)):

| Container   | Port  | `/api/atelier` authentication                              |
| ----------- | ----- | ---------------------------------------------------------- |
| `iris`      | 52799 | password only (`_SYSTEM`/`SYS`)                            |
| `iris-anon` | 52798 | unauthenticated only                                       |

Both run [iris/setup/setup.sh](iris/setup/setup.sh) after IRIS starts, which sets a 10-second
`/api/atelier` session timeout so expired-session recovery can be tested. The cases connect to them
through the committed [client/](client) folder and the generated workspace settings.

In CI this runs from [.github/workflows/prepare-release.yml](../.github/workflows/prepare-release.yml),
on PRs whose source branch starts with `prepare-` and on manual dispatch. To run locally with Podman:

```sh
podman compose -f test-fixtures/iris/docker-compose.yml up -d --wait
npm test
podman compose -f test-fixtures/iris/docker-compose.yml down -v
```
