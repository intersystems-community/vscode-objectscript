import vscode = require("vscode");
import {
  currentFile,
  currentFileFromContent,
  getFileText,
  methodOffsetToLine,
  stripClassMemberNameQuotes,
} from "../utils";
import {
  InitializedEvent,
  LoggingDebugSession,
  ErrorDestination,
  OutputEvent,
  StoppedEvent,
  ThreadEvent,
  Thread,
  StackFrame,
  Scope,
  Source,
  TerminatedEvent,
} from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import WebSocket = require("ws");
import { AtelierAPI } from "../api";
import * as xdebug from "./xdebugConnection";
import { lsExtensionId, schemas } from "../extension";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";
import { formatPropertyValue } from "./utils";
import { isfsConfig } from "../utils/FileProviderUtil";

interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  /** An absolute path to the "program" to debug. */
  program: string;
}

interface AttachRequestArguments extends DebugProtocol.AttachRequestArguments {
  /** The process id to attach to. */
  processId?: string;
  /** The CSP debug ID to use to identify the target process. */
  cspDebugId?: string;
  /** Automatically stop target after connect. If not specified, target does not stop. */
  stopOnEntry?: boolean;
  /** True if this request is for a unit test debug session. Only passed when `cspDebugId` is set. */
  isUnitTest?: boolean;
}

/** converts a uri from VS Code to a server-side XDebug file URI with respect to source root settings */
async function convertClientPathToDebugger(uri: vscode.Uri, namespace: string): Promise<string> {
  const { scheme, path } = uri;
  let fileName: string;
  if (scheme && schemas.includes(scheme)) {
    const { ns } = isfsConfig(uri);
    if (ns) namespace = ns;
    fileName = path.slice(1).replace(/\//g, ".");
  } else {
    fileName = currentFileFromContent(uri, await getFileText(uri))?.name;
  }

  namespace = encodeURIComponent(namespace);
  fileName = encodeURIComponent(fileName);
  return `dbgp://|${namespace}|${fileName}`;
}

export class ObjectScriptDebugSession extends LoggingDebugSession {
  /** After setupAPI() has been called this will return the serverId string */
  public get serverId(): string | undefined {
    return this._api?.serverId;
  }

  private _api?: AtelierAPI;

  private _workspaceFolderUri?: vscode.Uri;

  private _statuses = new Map<xdebug.Connection, xdebug.StatusResponse>();

  private _connection: xdebug.Connection;

  private _namespace: string;

  private _url: string;

  private _debugTargetSet = false;

  private _stackFrameIdCounter = 1;

  private _stackFrames = new Map<number, xdebug.StackFrame>();

  private _variableIdCounter = 1;

  private _contexts = new Map<number, xdebug.Context>();

  private _contextNames: string[] = ["Private", "Public", "Class"];

  private _properties = new Map<number, xdebug.Property>();

  private _evalResultProperties = new Map<number, xdebug.EvalResultProperty>();

  private _workspace: string;

  /** If this is a CSPDEBUG session */
  private _isCsp = false;

  /** The condition used for the watchpoint that allows us to detach from a CSPDEBUG session after the page has been loaded. */
  private readonly _cspWatchpointCondition = `(($DATA(allowed)=1)&&(allowed=1)&&($ZNAME="%SYS.cspServer")&&(%response.Timeout'="")&&($CLASSNAME()="%CSP.Session"))`;

  /** If this is a unit test session */
  private _isUnitTest = false;

  /** The condition used for the watchpoint that allows us to detach from a CSPDEBUG session after the unit tests have finished running. */
  private readonly _unitTestWatchpointCondition = `(($ZNAME?1"%Api.Atelier.v".E)&&($CLASSNAME()?1"%Api.Atelier.v".E))`;

  /** If we're stopped at a breakpoint. */
  private _break = false;

  /** If this is a `launch` session */
  private _isLaunch = false;

  public constructor() {
    super();

    // this debugger uses zero-based lines and columns
    this.setDebuggerLinesStartAt1(false);
    this.setDebuggerColumnsStartAt1(false);
  }

  /** Wait indefinitely for the debug target to be set */
  private async _waitForDebugTarget(): Promise<void> {
    do {
      await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100 ms
    } while (!this._debugTargetSet);
  }

  /** To be called immediately after construction */
  public setupAPI(workspaceFolderUri?: vscode.Uri): void {
    // Only effective the first time
    if (this._api) {
      return;
    }

    this._workspaceFolderUri = workspaceFolderUri;
    if (workspaceFolderUri) {
      // The uri of the relevant workspace folder was set after construction
      this._workspace = undefined;
      this._api = new AtelierAPI(workspaceFolderUri);
    } else {
      // Fall back to old way of deciding where to connect
      const file = currentFile();
      this._workspace = file?.workspaceFolder;
      this._api = new AtelierAPI(file?.uri);
    }
    return;
  }

  /** Check if the target is stopped */
  private async _isStopped(): Promise<boolean> {
    return this._connection
      .sendStepIntoCommand()
      .then((resp: xdebug.StatusResponse) => {
        if (resp.status == "stopped") {
          // Target unattached, terminate session
          this.sendEvent(new TerminatedEvent());
          return false;
        }
        return true;
      })
      .catch((err: xdebug.XDebugError) => {
        if (!err.message.includes("#6709")) {
          // Target unattached, terminate session
          this.sendEvent(new TerminatedEvent());
        }
        return false;
      });
  }

  protected async initializeRequest(
    response: DebugProtocol.InitializeResponse,
    args: DebugProtocol.InitializeRequestArguments
  ): Promise<void> {
    response.body = {
      ...response.body,
      supportsConfigurationDoneRequest: true,
      supportsEvaluateForHovers: true,
      supportsSetVariable: true,
      supportsConditionalBreakpoints: true,
      supportsHitConditionalBreakpoints: true,
      supportsStepBack: false,
      supportsDataBreakpoints: true,
    };

    try {
      if (!this._api.active) {
        throw new Error("Connection not active");
      }
      this._namespace = this._api.ns;
      this._url = this._api.xdebugUrl();

      const socket = new WebSocket(this._url, {
        rejectUnauthorized: vscode.workspace.getConfiguration("http").get("proxyStrictSSL"),
        headers: {
          cookie: this._api.cookies,
        },
      });

      const disposeConnection = (error?: Error): void => {
        if (!this._connection) {
          return;
        }
        this.sendEvent(new ThreadEvent("exited", this._connection.id));
        this._connection.close();
        this._connection = null;
      };
      this._connection = new xdebug.Connection(socket)
        .on("warning", (warning: string) => {
          this.sendEvent(new OutputEvent(warning + "\n"));
        })
        .on("close", disposeConnection)
        .on("error", disposeConnection)
        .on("stdout", (data: string) => {
          this.sendEvent(new OutputEvent(data, "stdout"));
        });

      await this._connection.waitForInitPacket();

      await this._connection.sendFeatureSetCommand("max_data", 8192);
      await this._connection.sendFeatureSetCommand("max_children", 32);
      await this._connection.sendFeatureSetCommand("max_depth", 2);
      await this._connection.sendFeatureSetCommand("notify_ok", 1);
      await this._connection.sendFeatureSetCommand(
        "step_granularity",
        vscode.workspace.getConfiguration("objectscript.debug").get<string>("stepGranularity")
      );

      this.sendResponse(response);

      this.sendEvent(new InitializedEvent());
    } catch (error) {
      let message = "Failed to start the debug session. ";
      if (error instanceof Error && error.message == "Connection not active") {
        message += "Server connection is inactive.";
      } else {
        message += "Check that the InterSystems server's web server supports WebSockets.";
      }
      response.success = false;
      response.message = message;
      this.sendResponse(response);
    }
  }

  protected async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): Promise<void> {
    try {
      this._debugTargetSet = false;
      this._isLaunch = true;
      const debugTarget = `${this._namespace}:${args.program}`;
      await this._connection.sendFeatureSetCommand("debug_target", debugTarget, true);
    } catch (error) {
      this.sendErrorResponse(response, error);
      return;
    }
    this.sendResponse(response);
    this._debugTargetSet = true;
  }

  protected async attachRequest(response: DebugProtocol.AttachResponse, args: AttachRequestArguments): Promise<void> {
    try {
      this._debugTargetSet = this._isLaunch = false;
      const debugTarget =
        args.cspDebugId != undefined ? `CSPDEBUG:${args.cspDebugId}` : `PID:${args.processId.split("@")[0]}`;
      await this._connection.sendFeatureSetCommand("debug_target", debugTarget);
      if (args.cspDebugId != undefined) {
        if (args.isUnitTest) {
          // Set a watchpoint so the target breaks after the unit tests have finished
          await this._connection.sendBreakpointSetCommand(
            new xdebug.Watchpoint("QQQZZZDebugWatchpointTriggerVar", this._unitTestWatchpointCondition)
          );
          this._isUnitTest = true;
        } else {
          // Set a watchpoint so the target breaks after the REST response is sent
          await this._connection.sendBreakpointSetCommand(new xdebug.Watchpoint("ok", this._cspWatchpointCondition));
          this._isCsp = true;
        }
        this.sendResponse(response);
      } else {
        this._isCsp = false;
        // Wait for target to break
        let stopped: boolean = await this._isStopped();
        this.sendResponse(response);
        while (!stopped) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
          stopped = await this._isStopped();
        }
      }
    } catch (error) {
      this.sendErrorResponse(response, error);
      return;
    }
    this._debugTargetSet = true;
  }

  protected async pauseRequest(
    response: DebugProtocol.PauseResponse,
    args: DebugProtocol.PauseArguments
  ): Promise<void> {
    const xdebugResponse = await this._connection.sendBreakCommand();
    this.sendResponse(response);
    await this._checkStatus(xdebugResponse);
  }

  protected async configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    args: DebugProtocol.ConfigurationDoneArguments
  ): Promise<void> {
    if (!this._isLaunch && !this._isCsp) {
      // The debug agent ignores the first run command
      // for non-CSP attaches, so send one right away
      await this._connection.sendRunCommand();
      // Tell VS Code that we're stopped
      this.sendResponse(response);
      const event: DebugProtocol.StoppedEvent = new StoppedEvent("entry", this._connection.id);
      event.body.allThreadsStopped = false;
      this.sendEvent(event);
    } else {
      // Tell the debugger to run the target process
      const xdebugResponse = await this._connection.sendRunCommand();
      this.sendResponse(response);
      await this._checkStatus(xdebugResponse);
    }
  }

  protected async disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    args: DebugProtocol.DisconnectArguments
  ): Promise<void> {
    this._debugTargetSet = false;
    if (this._connection) {
      // Detach is always supported by the debug agent
      // If attach, it will detach from the target
      // If launch, it will terminate the target
      const xdebugResponse = await this._connection.sendDetachCommand();
      this.sendResponse(response);
      await this._checkStatus(xdebugResponse);
    } else {
      this.sendResponse(response);
    }
  }

  protected async setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments
  ): Promise<void> {
    try {
      await this._waitForDebugTarget();

      const filePath = args.source.path;
      const scheme = filePath.split(":")[0];
      const uri = schemas.includes(scheme) ? vscode.Uri.parse(filePath) : vscode.Uri.file(filePath);
      const fileUri = await convertClientPathToDebugger(uri, this._namespace);
      const [, fileName] = fileUri.match(/\|([^|]+)$/);
      const languageServer: boolean = vscode.extensions.getExtension(lsExtensionId)?.isActive ?? false;

      const currentList = await this._connection.sendBreakpointListCommand();
      currentList.breakpoints
        .filter((breakpoint) => {
          if (breakpoint instanceof xdebug.LineBreakpoint) {
            return breakpoint.fileUri === fileName;
          }
          return false;
        })
        .map((breakpoint) => {
          this._connection.sendBreakpointRemoveCommand(breakpoint);
        });

      let xdebugBreakpoints: (xdebug.ConditionalBreakpoint | xdebug.ClassLineBreakpoint | xdebug.LineBreakpoint)[] = [];
      let symbols: vscode.DocumentSymbol[];
      if (fileName.endsWith("cls")) {
        // Compute DocumentSymbols for this class
        symbols = (
          await vscode.commands.executeCommand<vscode.DocumentSymbol[]>("vscode.executeDocumentSymbolProvider", uri)
        )[0].children;
      }
      xdebugBreakpoints = await Promise.all(
        args.breakpoints.map(async (breakpoint) => {
          const line = breakpoint.line;
          if (fileName.endsWith("cls")) {
            // Find the class member that this breakpoint is in
            let currentSymbol: vscode.DocumentSymbol;
            for (const symbol of symbols) {
              if (symbol.range.contains(new vscode.Position(line, 0))) {
                currentSymbol = symbol;
                break;
              }
            }
            if (
              currentSymbol !== undefined &&
              currentSymbol.kind === vscode.SymbolKind.Method &&
              currentSymbol.detail.toLowerCase() !== "query"
            ) {
              // This breakpoint is in a method
              const currentdoc = (await getFileText(uri)).split(/\r?\n/);
              const methodName = stripClassMemberNameQuotes(currentSymbol.name);
              if (languageServer) {
                // selectionRange.start.line is the method definition line
                for (
                  let methodlinenum = currentSymbol.selectionRange.start.line;
                  methodlinenum <= currentSymbol.range.end.line;
                  methodlinenum++
                ) {
                  // Find the offset of this breakpoint in the method
                  const methodlinetext: string = currentdoc[methodlinenum].trim();
                  if (methodlinetext.endsWith("{")) {
                    // This is the last line of the method definition, so count from here
                    if (breakpoint.condition) {
                      return new xdebug.ClassConditionalBreakpoint(
                        breakpoint.condition,
                        fileUri,
                        line,
                        methodName,
                        line - methodlinenum - 1,
                        breakpoint.hitCondition
                      );
                    } else {
                      return new xdebug.ClassLineBreakpoint(
                        fileUri,
                        line,
                        methodName,
                        line - methodlinenum - 1,
                        breakpoint.hitCondition
                      );
                    }
                  }
                }
              } else {
                // selectionRange.start.line is the start of the method code so count from there
                if (breakpoint.condition) {
                  return new xdebug.ClassConditionalBreakpoint(
                    breakpoint.condition,
                    fileUri,
                    line,
                    methodName,
                    line - currentSymbol.selectionRange.start.line,
                    breakpoint.hitCondition
                  );
                } else {
                  return new xdebug.ClassLineBreakpoint(
                    fileUri,
                    line,
                    methodName,
                    line - currentSymbol.selectionRange.start.line,
                    breakpoint.hitCondition
                  );
                }
              }
            }
          } else if (filePath.endsWith("mac") || filePath.endsWith("int")) {
            if (breakpoint.condition) {
              return new xdebug.RoutineConditionalBreakpoint(
                breakpoint.condition,
                fileUri,
                line,
                "",
                line - 1,
                breakpoint.hitCondition
              );
            } else {
              return new xdebug.RoutineLineBreakpoint(fileUri, line, "", line - 1, breakpoint.hitCondition);
            }
          } else {
            if (breakpoint.condition) {
              return new xdebug.ConditionalBreakpoint(breakpoint.condition, fileUri, line, breakpoint.hitCondition);
            } else {
              return new xdebug.LineBreakpoint(fileUri, line, breakpoint.hitCondition);
            }
          }
        })
      ).then((bps) => bps.filter((bp) => typeof bp == "object"));

      const vscodeBreakpoints: DebugProtocol.Breakpoint[] = [];
      await Promise.all(
        xdebugBreakpoints.map(async (breakpoint, index) => {
          try {
            if (breakpoint.hitCondition && !/^[1-9]\d*$/.test(breakpoint.hitCondition)) {
              // The user-defined hitCondition wasn't a positive integer
              vscodeBreakpoints[index] = {
                verified: false,
                line: breakpoint.line,
                message: "Hit Count must be a positive integer",
              };
            } else {
              await this._connection.sendBreakpointSetCommand(breakpoint);
              vscodeBreakpoints[index] = { verified: true, line: breakpoint.line };
            }
          } catch (error) {
            vscodeBreakpoints[index] = {
              verified: false,
              line: breakpoint.line,
              message: error.message,
            };
          }
        })
      );

      // send back the actual breakpoint positions
      response.body = {
        breakpoints: vscodeBreakpoints,
      };
    } catch (error) {
      this.sendErrorResponse(response, error);
      return;
    }

    this.sendResponse(response);
  }

  protected dataBreakpointInfoRequest(
    response: DebugProtocol.DataBreakpointInfoResponse,
    args: DebugProtocol.DataBreakpointInfoArguments
  ): void {
    if (
      args.variablesReference !== undefined &&
      [0, 1].includes(this._contexts.get(args.variablesReference).id) &&
      !args.name.includes("(")
    ) {
      // This is an unsubscripted private or public local variable
      response.body = {
        dataId: args.name,
        description: args.name,
      };
    } else {
      // This is an object property or array element, or args.variablesReference is undefined
      response.body = {
        dataId: null,
        // This message isn't surfaced in VS Code, which simply doesn't offer the context menu option when dataId is null
        description: "Can only set a watchpoint on an unsubscripted local variable",
      };
    }

    this.sendResponse(response);
  }

  protected async setDataBreakpointsRequest(
    response: DebugProtocol.SetDataBreakpointsResponse,
    args: DebugProtocol.SetDataBreakpointsArguments
  ): Promise<void> {
    try {
      await this._waitForDebugTarget();

      const currentList = await this._connection.sendBreakpointListCommand();
      currentList.breakpoints
        .filter((breakpoint) => {
          if (breakpoint instanceof xdebug.Watchpoint) {
            return true;
          }
          return false;
        })
        .map((breakpoint) => {
          this._connection.sendBreakpointRemoveCommand(breakpoint);
        });

      let xdebugWatchpoints: xdebug.Watchpoint[] = [];
      xdebugWatchpoints = await Promise.all(
        args.breakpoints.map(async (breakpoint) => {
          return new xdebug.Watchpoint(breakpoint.dataId);
        })
      );

      const vscodeWatchpoints: DebugProtocol.Breakpoint[] = [];
      await Promise.all(
        xdebugWatchpoints.map(async (breakpoint, index) => {
          try {
            await this._connection.sendBreakpointSetCommand(breakpoint);
            vscodeWatchpoints[index] = { verified: true, instructionReference: breakpoint.variable };
          } catch (error) {
            vscodeWatchpoints[index] = {
              verified: false,
              instructionReference: breakpoint.variable,
              message: error.message,
            };
          }
        })
      );

      // send back the watchpoints
      response.body = {
        breakpoints: vscodeWatchpoints,
      };
    } catch (error) {
      this.sendErrorResponse(response, error);
      return;
    }

    this.sendResponse(response);
  }

  protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    // runtime supports now threads so just return a default thread.
    response.body = {
      threads: [new Thread(this._connection.id, `Thread ${this._connection.id}]`)],
    };
    this.sendResponse(response);
  }

  protected async stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    args: DebugProtocol.StackTraceArguments
  ): Promise<void> {
    const stack = await this._connection.sendStackGetCommand();

    // Is set to true if we're at the CSP or unit test ending watchpoint.
    // We need to do this so VS Code doesn't try to open the source of
    // a stack frame before the debug session terminates. That should
    // only happen if the server has source code for %SYS.cspServer.mac/int
    // or %Api.Atelier.v<X>.cls/.int where X >= 8.
    let noStack = false;
    const stackFrames = await Promise.all(
      stack.stack.map(async (stackFrame: xdebug.StackFrame, index): Promise<StackFrame> => {
        const [, namespace, name] = decodeURI(stackFrame.fileUri).match(/^dbgp:\/\/\|([^|]+)\|(.*)$/);
        const routine = name;
        const fileUri = DocumentContentProvider.getUri(
          routine,
          this._workspace,
          namespace,
          undefined,
          this._workspaceFolderUri
        );
        const source = new Source(routine, fileUri.toString());
        let line = stackFrame.line + 1;
        const place = `${stackFrame.method}+${stackFrame.methodOffset}`;
        const stackFrameId = this._stackFrameIdCounter++;
        const fileText: string | undefined = await getFileText(fileUri).catch(() => undefined);
        const hasCmdLoc = typeof stackFrame.cmdBeginLine == "number";
        if (fileText == undefined) {
          // Can't get the source for the document
          this._stackFrames.set(stackFrameId, stackFrame);
          return {
            id: stackFrameId,
            name: place,
            source: {
              name: routine,
              path: fileUri.toString(),
              presentationHint: "deemphasize",
            },
            line,
            column: 0,
          };
        }
        let noSource = false;
        try {
          if (source.name.endsWith(".cls") && stackFrame.method !== "") {
            // Compute DocumentSymbols for this class
            const symbols: vscode.DocumentSymbol[] = (
              await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                "vscode.executeDocumentSymbolProvider",
                fileUri
              )
            )[0].children;
            const newLine = methodOffsetToLine(symbols, fileText, stackFrame.method, stackFrame.methodOffset);
            if (newLine != undefined) line = newLine;
          }
          if (
            this._isCsp &&
            this._break &&
            ["%SYS.cspServer.mac", "%SYS.cspServer.int"].includes(source.name) &&
            index == 0
          ) {
            // Check if we're at our special watchpoint
            const { result } = await this._connection.sendEvalCommand(this._cspWatchpointCondition);
            if (result.type == "int" && result.value == "1") {
              // Stop the debugging session
              const xdebugResponse = await this._connection.sendDetachCommand();
              await this._checkStatus(xdebugResponse);
              noStack = true;
            }
          }
          if (this._isUnitTest && this._break && source.name.startsWith("%Api.Atelier.v") && index == 0) {
            // Check if we're at our special watchpoint
            const { result } = await this._connection.sendEvalCommand(this._unitTestWatchpointCondition);
            if (result.type == "int" && result.value == "1") {
              // Stop the debugging session
              const xdebugResponse = await this._connection.sendDetachCommand();
              await this._checkStatus(xdebugResponse);
              noStack = true;
            }
          }
          this._stackFrames.set(stackFrameId, stackFrame);
        } catch (ex) {
          noSource = true;
        }
        const lineDiff = line - stackFrame.line;
        return {
          id: stackFrameId,
          name: place,
          source: noSource ? null : source,
          line,
          column: hasCmdLoc ? stackFrame.cmdBeginPos + 1 : 0,
          endLine: hasCmdLoc ? stackFrame.cmdEndLine + lineDiff : undefined,
          endColumn: hasCmdLoc
            ? (stackFrame.cmdEndPos == 0
                ? // A command that ends at position zero means "rest of this line"
                  fileText.split(/\r?\n/)[stackFrame.cmdEndLine + lineDiff - 1].length
                : stackFrame.cmdEndPos) + 1
            : undefined,
        };
      })
    );

    this._break = false;
    if (!noStack) {
      response.body = {
        stackFrames,
      };
    }
    this.sendResponse(response);
  }

  protected async scopesRequest(
    response: DebugProtocol.ScopesResponse,
    args: DebugProtocol.ScopesArguments
  ): Promise<void> {
    let scopes = new Array<Scope>();
    const stackFrame = this._stackFrames.get(args.frameId);
    if (!stackFrame) {
      throw new Error(`Unknown frameId ${args.frameId}`);
    }
    const contexts = await stackFrame.getContexts();
    scopes = contexts.map((context) => {
      const variableId = this._variableIdCounter++;
      this._contexts.set(variableId, context);
      if (context.id < this._contextNames.length) {
        return new Scope(this._contextNames[context.id], variableId);
      } else {
        return new Scope(context.name, variableId);
      }
    });
    response.body = {
      scopes,
    };
    this.sendResponse(response);
  }

  protected async variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments
  ): Promise<void> {
    const variablesReference = args.variablesReference;
    let variables = new Array<DebugProtocol.Variable>();

    let properties: xdebug.BaseProperty[];
    if (this._contexts.has(variablesReference)) {
      // VS Code is requesting the variables for a SCOPE, so we have to do a context_get
      const context = this._contexts.get(variablesReference);
      properties = await context.getProperties();
    } else if (this._properties.has(variablesReference)) {
      // VS Code is requesting the subelements for a variable, so we have to do a property_get
      const property = this._properties.get(variablesReference);
      if (property.hasChildren) {
        if (property.children.length === property.numberOfChildren) {
          properties = property.children;
        } else {
          properties = await property.getChildren();
        }
      } else {
        properties = [];
      }
    } else if (this._evalResultProperties.has(variablesReference)) {
      // the children of properties returned from an eval command are always inlined, so we simply resolve them
      const property = this._evalResultProperties.get(variablesReference);
      properties = property.hasChildren ? property.children : [];
    } else {
      throw new Error("Unknown variable reference");
    }
    variables = properties.map((property) => {
      const displayValue = formatPropertyValue(property);
      let variablesReference: number;
      let evaluateName: string;
      if (property.hasChildren || property.type === "array" || property.type === "object") {
        variablesReference = this._variableIdCounter++;
        if (property instanceof xdebug.Property) {
          this._properties.set(variablesReference, property);
        } else if (property instanceof xdebug.EvalResultProperty) {
          this._evalResultProperties.set(variablesReference, property);
        }
      } else {
        variablesReference = 0;
      }
      if (property instanceof xdebug.Property) {
        evaluateName = property.fullName;
      } else {
        evaluateName = property.name;
      }
      const variable: DebugProtocol.Variable = {
        name: property.name,
        value: displayValue,
        type: property.type,
        variablesReference,
        evaluateName,
      };
      return variable;
    });
    response.body = {
      variables,
    };
    this.sendResponse(response);
  }

  /**
   * Checks the status of a StatusResponse and notifies VS Code accordingly
   * @param {xdebug.StatusResponse} response
   */
  private async _checkStatus(response: xdebug.StatusResponse): Promise<void> {
    const connection = response.connection;
    this._statuses.set(connection, response);
    if (response.status === "stopping") {
      const newResponse = await connection.sendStopCommand();
      this._checkStatus(newResponse);
    } else if (response.status === "stopped") {
      this.sendEvent(new ThreadEvent("exited", connection.id));
      connection.close();
      delete this._connection;
      this.sendEvent(new TerminatedEvent());
    } else if (response.status === "break") {
      // StoppedEvent reason can be 'step', 'breakpoint', 'exception' or 'pause'
      let stoppedEventReason: "step" | "breakpoint" | "exception" | "pause" | "entry";
      let exceptionText: string | undefined;
      if (response.exception) {
        // If one of the ignore patterns matches, ignore this exception
        stoppedEventReason = "exception";
        // this seems to be ignored currently by VS Code
        exceptionText = response.exception.name + ": " + response.exception.message;
      } else if (response.command.indexOf("step") === 0) {
        stoppedEventReason = "step";
      } else {
        stoppedEventReason = "breakpoint";
      }
      this._break = true;
      const event: DebugProtocol.StoppedEvent = new StoppedEvent(stoppedEventReason, connection.id, exceptionText);
      event.body.allThreadsStopped = false;
      this.sendEvent(event);
    }
  }

  protected async continueRequest(
    response: DebugProtocol.ContinueResponse,
    args: DebugProtocol.ContinueArguments
  ): Promise<void> {
    this.sendResponse(response);
    const xdebugResponse = await this._connection.sendRunCommand();
    this._checkStatus(xdebugResponse);
  }

  protected async nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): Promise<void> {
    const xdebugResponse = await this._connection.sendStepOverCommand();
    this.sendResponse(response);
    this._checkStatus(xdebugResponse);
  }

  protected async stepInRequest(
    response: DebugProtocol.StepInResponse,
    args: DebugProtocol.StepInArguments
  ): Promise<void> {
    const xdebugResponse = await this._connection.sendStepIntoCommand();
    this.sendResponse(response);
    this._checkStatus(xdebugResponse);
  }

  protected async stepOutRequest(
    response: DebugProtocol.StepOutResponse,
    args: DebugProtocol.StepOutArguments
  ): Promise<void> {
    const xdebugResponse = await this._connection.sendStepOutCommand();
    this.sendResponse(response);
    this._checkStatus(xdebugResponse);
  }

  protected async evaluateRequest(
    response: DebugProtocol.EvaluateResponse,
    args: DebugProtocol.EvaluateArguments
  ): Promise<void> {
    const { result } = await this._connection.sendEvalCommand(args.expression);
    if (result) {
      const displayValue = formatPropertyValue(result);
      let variablesReference: number;
      // if the property has children, generate a variable ID and save the property (including children) so VS Code can request them
      if (result.hasChildren || result.type === "array" || result.type === "object") {
        variablesReference = this._variableIdCounter++;
        this._evalResultProperties.set(variablesReference, result);
      } else {
        variablesReference = 0;
      }
      response.body = { result: displayValue, variablesReference };
    } else {
      response.body = { result: "no result", variablesReference: 0 };
    }
    this.sendResponse(response);
  }

  protected async setVariableRequest(
    response: DebugProtocol.SetVariableResponse,
    args: DebugProtocol.SetVariableArguments
  ): Promise<void> {
    const { value, name, variablesReference } = args;
    let property = null;
    if (this._contexts.has(variablesReference)) {
      // VS Code is requesting the variables for a SCOPE, so we have to do a context_get
      const context = this._contexts.get(variablesReference);
      const properties = await context.getProperties();
      property = properties.find((el) => el.name === name);
    } else if (this._properties.has(variablesReference)) {
      // VS Code is requesting the subelements for a variable, so we have to do a property_get
      property = this._properties.get(variablesReference);
    }
    property.value = value;
    await this._connection.sendPropertySetCommand(property);

    response.body = {
      value: args.value,
    };
    this.sendResponse(response);
  }

  protected sendErrorResponse(response: DebugProtocol.Response, error: Error, dest?: ErrorDestination): void;
  protected sendErrorResponse(
    response: DebugProtocol.Response,
    codeOrMessage: number | DebugProtocol.Message,
    format?: string,

    variables?: any,
    dest?: ErrorDestination
  ): void;
  protected sendErrorResponse(response: DebugProtocol.Response, ...rest: any[]): void {
    if (rest[0] instanceof Error) {
      const error = rest[0] as Error & { code?: number | string; errno?: number };
      const dest = rest[1] as ErrorDestination;
      let code: number;
      if (typeof error.code === "number") {
        code = error.code as number;
      } else if (typeof error.errno === "number") {
        code = error.errno;
      } else {
        code = 0;
      }
      super.sendErrorResponse(response, code, error.message, dest);
    } else {
      super.sendErrorResponse(response, rest[0], rest[1], rest[2], rest[3]);
    }
  }
}
