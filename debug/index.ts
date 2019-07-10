import * as net from "net";
import * as vscode from "vscode-debugadapter";
import { DebugProtocol as VSCodeDebugProtocol } from "vscode-debugprotocol";

interface ILaunchRequestArguments extends VSCodeDebugProtocol.LaunchRequestArguments {
}

class ObjectScriptDebugSession extends vscode.DebugSession {
  private _args: ILaunchRequestArguments;
  private _server: net.Server;

  protected async launchRequest(response: VSCodeDebugProtocol.LaunchResponse, args: ILaunchRequestArguments) {
    this._args = args;
    /** launches the script as CLI */
    const launchScript = async () => { };

    /** sets up a TCP server to listen for XDebug connections */
    const createServer = () =>
      new Promise((resolve, reject) => {
        const server = (this._server = net.createServer());
        server.on("connection", async (socket: net.Socket) => {
          try {
            // new XDebug connection
            const connection = new xdebug.Connection(socket);
            this._connections.set(connection.id, connection);
            this._waitingConnections.add(connection);
            const disposeConnection = (error?: Error) => {
              if (this._connections.has(connection.id)) {
                if (error) {
                  this.sendEvent(
                    new vscode.OutputEvent(
                      "connection " + connection.id + ": " + error.message + "\n",
                    ),
                  );
                }
                this.sendEvent(new vscode.ThreadEvent("exited", connection.id));
                connection.close();
                this._connections.delete(connection.id);
                this._waitingConnections.delete(connection);
              }
            };
            connection.on("warning", (warning: string) => {
              this.sendEvent(new vscode.OutputEvent(warning + "\n"));
            });
            connection.on("error", disposeConnection);
            connection.on("close", disposeConnection);
            await connection.waitForInitPacket();

            // override features from launch.json
            try {
              const xdebugSettings = {};
              await Promise.all(
                Object.keys(xdebugSettings).map((setting) =>
                  connection.sendFeatureSetCommand(setting, xdebugSettings[setting]),
                ),
              );
            } catch (error) {
              throw new Error(
                "Error applying xdebugSettings: " + (error instanceof Error ? error.message : error),
              );
            }

            this.sendEvent(new vscode.ThreadEvent("started", connection.id));

            // request breakpoints from VS Code
            await this.sendEvent(new vscode.InitializedEvent());
          } catch (error) {
            this.sendEvent(
              new vscode.OutputEvent((error instanceof Error ? error.message : error) + "\n", "stderr"),
            );
            this.shutdown();
          }
        });
        server.on("error", (error: Error) => {
          // this.sendEvent(new vscode.OutputEvent(util.inspect(error) + "\n"));
          // this.sendErrorResponse(response,  error as Error);
        });
        // server.listen(
        //   52773,
        //   "localhost",
        //   (error: NodeJS.ErrnoException) => (error ? reject(error) : resolve()),
        // );
      });
    try {
      if (!args.noDebug) {
        await createServer();
      }
    } catch (error) {
      // this.sendErrorResponse(response, error as Error);
      return;
    }
    this.sendResponse(response);
  }
}

vscode.DebugSession.run(ObjectScriptDebugSession);
