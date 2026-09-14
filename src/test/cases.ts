/**
 * The connection test matrix, shared by runTest.ts (which generates one workspace file per launch)
 * and the test suite (which reads its launch back from the open workspace's file name). See
 * test-fixtures/README.md for the design. Pure Node, no vscode import, so runTest can use it too.
 */

export const SESSION_TIMEOUT_MS = 10000;

/** The two IRIS containers in test-fixtures/iris/docker-compose.yml */
export interface Server {
	/** intersystems.servers entry key and isfs authority for the -sm cases */
	serverName: string;
	/** Published host port */
	port: number;
	/** docker-compose service for the clientSide-os-docker case */
	service: string;
	username?: string;
	password?: string;
}
export const NAMED: Server = { serverName: "named", port: 52799, service: "iris", username: "_SYSTEM", password: "SYS" };
export const ANONYMOUS: Server = { serverName: "anonymous", port: 52798, service: "iris-anon" };

export type Kind = "clientSide-os-host" | "clientSide-os-docker" | "clientSide-sm" | "serverSide-sm";
const KINDS: Kind[] = ["clientSide-os-host", "clientSide-os-docker", "clientSide-sm", "serverSide-sm"];

export interface Launch {
	name: string;
	kind: Kind;
	server: Server;
	/** undefined for serverSide-sm, which is always active */
	active?: boolean;
}

/** Only these cases have a toggleable active state; docker-compose connections are always active */
export function togglesActive(kind: Kind): boolean {
	return kind === "clientSide-os-host" || kind === "clientSide-sm";
}

/**
 * The 12 launches: clientSide-os-host and clientSide-sm × credentials × active, plus clientSide-os-docker
 * and serverSide-sm × credentials (both always active).
 */
export function allLaunches(): Launch[] {
	const out: Launch[] = [];
	for (const kind of KINDS) {
		for (const server of [NAMED, ANONYMOUS]) {
			if (togglesActive(kind)) {
				for (const active of [true, false]) {
					out.push({ name: `${kind}-${server.serverName}-${active ? "active" : "inactive"}`, kind, server, active });
				}
			} else {
				out.push({ name: `${kind}-${server.serverName}`, kind, server });
			}
		}
	}
	return out;
}

export function parse(name: string): Launch {
	const launch = allLaunches().find((l) => l.name === name);
	if (!launch) { throw new Error(`Unknown case '${name}'`); }
	return launch;
}

/** The .code-workspace contents for a launch. Folder paths are relative to test-fixtures/.generated/. */
export function workspaceFile(l: Launch): object {
	const { kind, server, active } = l;
	const credentials = server.username ? { username: server.username, password: server.password } : {};
	const activeConn = active ? { active: true } : {};
	const entry = {
		[server.serverName]: {
			webServer: { scheme: "http", host: "localhost", port: server.port, pathPrefix: "" },
			...credentials,
		},
	};
	switch (kind) {
		case "clientSide-os-host":
			return {
				folders: [{ path: "../client" }],
				settings: {
					"objectscript.conn": { https: false, host: "localhost", port: server.port, ns: "USER", ...credentials, ...activeConn },
				},
			};
		case "clientSide-os-docker":
			// A docker-compose connection resolves its port only when objectscript.conn.active is truthy;
			// the extension bails on an inactive connection before it ever runs compose.
			return {
				folders: [{ path: "../client" }],
				settings: {
					"objectscript.conn": {
						"docker-compose": { file: "../iris/docker-compose.yml", service: server.service },
						ns: "USER", active: true, ...credentials,
					},
				},
			};
		case "clientSide-sm":
			return {
				folders: [{ path: "../client" }],
				settings: {
					"objectscript.conn": { server: server.serverName, ns: "USER", ...activeConn },
					"intersystems.servers": entry,
				},
			};
		case "serverSide-sm":
			return {
				folders: [{ uri: `isfs://${server.serverName}:USER/` }],
				settings: { "intersystems.servers": entry },
			};
	}
}
