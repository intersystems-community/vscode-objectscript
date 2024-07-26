import net = require("net");
import vscode = require("vscode");
import { ObjectScriptDebugSession } from "./debugSession";

export class ObjectScriptDebugAdapterDescriptorFactory
  implements vscode.DebugAdapterDescriptorFactory, vscode.Disposable
{
  private serverMap = new Map<string, net.Server>();

  public createDebugAdapterDescriptor(
    session: vscode.DebugSession,
    executable: vscode.DebugAdapterExecutable | undefined
  ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    const debugSession = new ObjectScriptDebugSession();

    // pickProcess may have added a suffix to inform us which folder's connection it used
    const workspaceFolderIndex = (session.configuration.processId as string)?.split("@")[1];
    const workspaceFolderUri = workspaceFolderIndex
      ? vscode.workspace.workspaceFolders[parseInt(workspaceFolderIndex)]?.uri
      : undefined;
    debugSession.setupAPI(workspaceFolderUri);

    const serverId = debugSession.serverId;
    let server = this.serverMap.get(serverId);
    if (!server) {
      // start listening on a random port
      server = net
        .createServer((socket) => {
          debugSession.setRunAsServer(true);
          debugSession.start(socket as NodeJS.ReadableStream, socket);
        })
        .listen(0);
      this.serverMap.set(serverId, server);
    }

    // make VS Code connect to this debug server
    const address = server.address();
    const port = typeof address !== "string" ? address.port : 9000;
    return new vscode.DebugAdapterServer(port);
  }

  public dispose(): void {
    this.serverMap.forEach((server) => server.close());
  }
}
