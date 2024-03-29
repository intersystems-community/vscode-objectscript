import net = require("net");
import vscode = require("vscode");
import { ObjectScriptDebugSession } from "./debugSession";

export class ObjectScriptDebugAdapterDescriptorFactory
  implements vscode.DebugAdapterDescriptorFactory, vscode.Disposable
{
  private server?: net.Server;

  public createDebugAdapterDescriptor(
    session: vscode.DebugSession,
    executable: vscode.DebugAdapterExecutable | undefined
  ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    if (!this.server) {
      // start listening on a random port
      const debugSession = new ObjectScriptDebugSession();

      this.server = net
        .createServer((socket) => {
          debugSession.setRunAsServer(true);
          debugSession.start(socket as NodeJS.ReadableStream, socket);
        })
        .listen(0);
    }

    // make VS Code connect to debug server
    const address = this.server.address();
    const port = typeof address !== "string" ? address.port : 9000;
    return new vscode.DebugAdapterServer(port);
  }

  public dispose(): void {
    if (this.server) {
      this.server.close();
    }
  }
}
