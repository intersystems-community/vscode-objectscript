/** The case matrix in test-fixtures/README.md, shared by runTest.ts and the suite. No vscode import. */
import type { IJSONServerSpec } from "@intersystems-community/intersystems-servermanager";

export const SESSION_TIMEOUT_MS = 10000;

/** The intersystems.servers entries, one per container */
export const SERVERS: Record<string, IJSONServerSpec> = {
  named: {
    webServer: { scheme: "http", host: "localhost", port: 52799, pathPrefix: "" },
    username: "_SYSTEM",
    password: "SYS",
  },
  anonymous: { webServer: { scheme: "http", host: "localhost", port: 52798, pathPrefix: "" } },
};

type Kind = "clientSide-os-host" | "clientSide-os-docker" | "clientSide-sm" | "serverSide-sm";
const KINDS: Kind[] = ["clientSide-os-host", "clientSide-os-docker", "clientSide-sm", "serverSide-sm"];
/** The others are always active: docker-compose is only resolved when active, and isfs has no `active` */
const TOGGLEABLE = new Set<Kind>(["clientSide-os-host", "clientSide-sm"]);

export interface Launch {
  name: string;
  kind: Kind;
  serverName: string;
  active?: boolean;
}
export const LAUNCHES: Launch[] = KINDS.flatMap((kind) =>
  Object.keys(SERVERS).flatMap((serverName) =>
    (TOGGLEABLE.has(kind) ? [true, false] : [undefined]).map((active) => ({
      name: `${kind}-${serverName}${active === undefined ? "" : active ? "-active" : "-inactive"}`,
      kind,
      serverName,
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
export function workspaceFile({ kind, serverName, active }: Launch): WorkspaceFile {
  const {
    webServer: { host, port },
    username,
    password,
  } = SERVERS[serverName];
  // -inactive omits the key to exercise the default
  const activeConn = active ? { active } : {};
  switch (kind) {
    case "clientSide-os-host":
      return {
        folders: [{ path: "client" }],
        settings: {
          "objectscript.conn": {
            https: false,
            host,
            port,
            ns: "USER",
            username,
            password,
            ...activeConn,
          },
        },
      };
    case "clientSide-os-docker":
      return {
        folders: [{ path: "client" }],
        settings: {
          "objectscript.conn": {
            "docker-compose": { file: "../../iris/docker-compose.yml", service: serverName },
            ns: "USER",
            active: true,
            username,
            password,
          },
        },
      };
    case "clientSide-sm":
      return {
        folders: [{ path: "client" }],
        settings: {
          "objectscript.conn": { server: serverName, ns: "USER", ...activeConn },
          "intersystems.servers": { [serverName]: SERVERS[serverName] },
        },
      };
    case "serverSide-sm":
      return {
        folders: [{ uri: `isfs://${serverName}:USER/` }],
        settings: { "intersystems.servers": { [serverName]: SERVERS[serverName] } },
      };
  }
}
