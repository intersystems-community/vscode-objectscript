/** The case matrix in test-fixtures/README.md, shared by runTest.ts and the suite. No vscode import. */
import type { IJSONServerSpec } from "@intersystems-community/intersystems-servermanager";

export const SESSION_TIMEOUT_MS = 10000;

interface Server {
  serverName: string;
  port: number;
  username?: string;
  password?: string;
}
const SERVERS: Server[] = [
  { serverName: "named", port: 52799, username: "_SYSTEM", password: "SYS" },
  { serverName: "anonymous", port: 52798 },
];

type Kind = "clientSide-os-host" | "clientSide-os-docker" | "clientSide-sm" | "serverSide-sm";
const KINDS: Kind[] = ["clientSide-os-host", "clientSide-os-docker", "clientSide-sm", "serverSide-sm"];
/** The others are always active: docker-compose is only resolved when active, and isfs has no `active` */
const TOGGLEABLE = new Set<Kind>(["clientSide-os-host", "clientSide-sm"]);

export interface Launch {
  name: string;
  kind: Kind;
  server: Server;
  active?: boolean;
}
export const LAUNCHES: Launch[] = KINDS.flatMap((kind) =>
  SERVERS.flatMap((server) =>
    (TOGGLEABLE.has(kind) ? [true, false] : [undefined]).map((active) => ({
      name: `${kind}-${server.serverName}${active === undefined ? "" : active ? "-active" : "-inactive"}`,
      kind,
      server,
      active,
    }))
  )
);

export function parse(name: string): Launch {
  const launch = LAUNCHES.find((l) => l.name === name);
  if (!launch) {
    throw new Error(`Unknown case '${name}'`);
  }
  return launch;
}

/** The objectscript.conn setting as the cases write it */
export interface Conn {
  ns: string;
  active?: boolean;
  https?: boolean;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  server?: string;
  "docker-compose"?: { file: string; service: string };
}

export interface WorkspaceFile {
  folders: ({ path: string } | { uri: string })[];
  settings: { "objectscript.conn"?: Conn; "intersystems.servers"?: Record<string, IJSONServerSpec> };
}

/** Folder paths are relative to test-fixtures/.generated/ */
export function workspaceFile({ kind, server, active }: Launch): WorkspaceFile {
  const credentials = server.username ? { username: server.username, password: server.password } : {};
  const conn: Conn = { ns: "USER", ...(active && { active }) };
  const client = { folders: [{ path: "../client" }] };
  const servers: Record<string, IJSONServerSpec> = {
    [server.serverName]: {
      webServer: { scheme: "http", host: "localhost", port: server.port, pathPrefix: "" },
      ...credentials,
    },
  };
  switch (kind) {
    case "clientSide-os-host":
      return {
        ...client,
        settings: {
          "objectscript.conn": { ...conn, https: false, host: "localhost", port: server.port, ...credentials },
        },
      };
    case "clientSide-os-docker":
      return {
        ...client,
        settings: {
          "objectscript.conn": {
            ...conn,
            active: true,
            "docker-compose": { file: "../iris/docker-compose.yml", service: server.serverName },
            ...credentials,
          },
        },
      };
    case "clientSide-sm":
      return {
        ...client,
        settings: { "objectscript.conn": { ...conn, server: server.serverName }, "intersystems.servers": servers },
      };
    case "serverSide-sm":
      return { folders: [{ uri: `isfs://${server.serverName}:USER/` }], settings: { "intersystems.servers": servers } };
  }
}
