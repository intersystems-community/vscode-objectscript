import vscode = require("vscode");
import { currentFile } from "../utils";
import { Subject } from "await-notify";
import {
  InitializedEvent,
  LoggingDebugSession,
  OutputEvent,
  StoppedEvent,
  ThreadEvent,
  Thread,
  StackFrame,
  Scope,
  Source,
  TerminatedEvent,
} from "vscode-debugadapter";
import { DebugProtocol } from "vscode-debugprotocol";
import WebSocket = require("ws");
import { AtelierAPI } from "../api";
import * as xdebug from "./xdebugConnection";
import { FILESYSTEM_SCHEMA } from "../extension";
import * as url from "url";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";
import { formatPropertyValue } from "./utils";

interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  /** An absolute path to the "program" to debug. */
  program: string;
  /** Automatically stop target after launch. If not specified, target does not stop. */
  stopOnEntry?: boolean;
}

interface AttachRequestArguments extends DebugProtocol.AttachRequestArguments {
  /** The process id to attach to. */
  processId: string;
  /** Automatically stop target after connect. If not specified, target does not stop. */
  stopOnEntry?: boolean;
}

/** converts a local path from VS Code to a server-side XDebug file URI with respect to source root settings */
export async function convertClientPathToDebugger(localPath: string, namespace: string): Promise<string> {
  const { protocol, pathname, query } = url.parse(decodeURIComponent(localPath), true, true);
  let fileName = localPath;
  if (protocol && protocol === `${FILESYSTEM_SCHEMA}:`) {
    if (query.ns && query.ns !== "") {
      namespace = query.ns.toString();
    }
    fileName = pathname.slice(1).replace(/\//, ".");
  } else {
    fileName = await vscode.workspace
      .openTextDocument(localPath)
      .then(currentFile)
      .then(curFile => {
        return curFile.name;
      });
  }

  namespace = encodeURIComponent(namespace);
  fileName = encodeURIComponent(fileName);
  return `dbgp://|${namespace}|${fileName}`;
}

export class ObjectScriptDebugSession extends LoggingDebugSession {
  // private _args: LaunchRequestArguments;

  private _statuses = new Map<xdebug.Connection, xdebug.StatusResponse>();

  private _connection: xdebug.Connection;

  private _namespace: string;

  private _url: string;

  private _debugTargetSet = new Subject();

  private _stackFrameIdCounter = 1;

  private _stackFrames = new Map<number, xdebug.StackFrame>();

  private _variableIdCounter = 1;

  private _contexts = new Map<number, xdebug.Context>();

  private _properties = new Map<number, xdebug.Property>();

  private _evalResultProperties = new Map<number, xdebug.EvalResultProperty>();

  public constructor() {
    super("mock-debug.txt");

    const api = new AtelierAPI();
    this._namespace = api.ns;
    this._url = api.xdebugUrl();

    // this debugger uses zero-based lines and columns
    this.setDebuggerLinesStartAt1(false);
    this.setDebuggerColumnsStartAt1(false);
  }

  protected async initializeRequest(
    response: DebugProtocol.InitializeResponse,
    args: DebugProtocol.InitializeRequestArguments
  ): Promise<void> {
    // build and return the capabilities of this debug adapter:
    response.body = {
      ...response.body,
      supportsConfigurationDoneRequest: true,
      supportsEvaluateForHovers: true,
      supportsSetVariable: true,
      supportsConditionalBreakpoints: false, // TODO
      supportsStepBack: false,
    };

    const socket = new WebSocket(this._url);

    const disposeConnection = (error?: Error): void => {
      this.sendEvent(new ThreadEvent("exited", this._connection.id));
      this._connection.close();
      this._connection = null;
    };
    this._connection = new xdebug.Connection(socket)
      .on("warning", (warning: string) => {
        this.sendEvent(new OutputEvent(warning + "\n"));
      })
      .on("close", disposeConnection)
      .on("stdout", (data: string) => {
        this.sendEvent(new OutputEvent(data, "stdout"));
      });

    await this._connection.waitForInitPacket();

    await this._connection.sendFeatureSetCommand("max_data", 8192);
    await this._connection.sendFeatureSetCommand("max_children", 32);
    await this._connection.sendFeatureSetCommand("max_depth", 2);
    await this._connection.sendFeatureSetCommand("notify_ok", 1);

    this.sendResponse(response);

    this.sendEvent(new InitializedEvent());
  }

  protected async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): Promise<void> {
    // this._args = args;

    const debugTarget = `${this._namespace}:${args.program}`;
    await this._connection.sendFeatureSetCommand("debug_target", debugTarget);

    this._debugTargetSet.notify();

    this.sendResponse(response);
  }

  protected async attachRequest(response: DebugProtocol.AttachResponse, args: AttachRequestArguments): Promise<void> {
    const debugTarget = `PID:${args.processId}`;
    await this._connection.sendFeatureSetCommand("debug_target", debugTarget);
    this._debugTargetSet.notify();

    this.sendResponse(response);
  }

  protected async pauseRequest(
    response: DebugProtocol.PauseResponse,
    args: DebugProtocol.PauseArguments
  ): Promise<void> {
    const xdebugResponse = await this._connection.sendBreakCommand();
    await this._checkStatus(xdebugResponse);

    this.sendResponse(response);
  }

  protected async configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    args: DebugProtocol.ConfigurationDoneArguments
  ): Promise<void> {
    const xdebugResponse = await this._connection.sendRunCommand();
    await this._checkStatus(xdebugResponse);

    this.sendResponse(response);
  }

  protected async disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    args: DebugProtocol.DisconnectArguments
  ): Promise<void> {
    if (this._connection) {
      const stopSupported = (await this._connection.sendFeatureGetCommand("stop")).supported;
      if (stopSupported) {
        const xdebugResponse = await this._connection.sendStopCommand();
        await this._checkStatus(xdebugResponse);
      }

      const detachSupported = (await this._connection.sendFeatureGetCommand("detach")).supported;
      if (detachSupported) {
        const xdebugResponse = await this._connection.sendDetachCommand();
        await this._checkStatus(xdebugResponse);
      }
    }

    this.sendResponse(response);
  }

  protected async setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments
  ): Promise<void> {
    await this._debugTargetSet.wait(1000);

    const filePath = args.source.path;
    const uri = filePath.startsWith(FILESYSTEM_SCHEMA) ? vscode.Uri.parse(filePath) : vscode.Uri.file(filePath);
    const fileUri = await convertClientPathToDebugger(args.source.path, this._namespace);
    const [, fileName] = fileUri.match(/\|([^|]+)$/);

    const currentList = await this._connection.sendBreakpointListCommand();
    currentList.breakpoints
      .filter(breakpoint => {
        if (breakpoint instanceof xdebug.LineBreakpoint) {
          return breakpoint.fileUri === fileName;
        }
        return false;
      })
      .map(breakpoint => {
        this._connection.sendBreakpointRemoveCommand(breakpoint);
      });

    let xdebugBreakpoints: (xdebug.ConditionalBreakpoint | xdebug.ClassLineBreakpoint | xdebug.LineBreakpoint)[] = [];
    xdebugBreakpoints = await Promise.all(
      args.breakpoints.map(async breakpoint => {
        const line = breakpoint.line;
        if (breakpoint.condition) {
          return new xdebug.ConditionalBreakpoint(breakpoint.condition, fileUri, line);
        } else if (fileName.endsWith("cls")) {
          return await vscode.workspace.openTextDocument(uri).then(document => {
            const methodMatchPattern = new RegExp(`^(?:Class)?Method ([^(]+)(?=[( ])`, "i");
            for (let i = line; line > 0; i--) {
              const lineOfCode = document.lineAt(i).text;
              const methodMatch = lineOfCode.match(methodMatchPattern);
              if (methodMatch) {
                const [, methodName] = methodMatch;
                return new xdebug.ClassLineBreakpoint(fileUri, line, methodName, line - i - 2);
              }
            }
          });
        } else if (filePath.endsWith("mac") || filePath.endsWith("int")) {
          return new xdebug.RoutineLineBreakpoint(fileUri, line, "", line - 1);
        } else {
          return new xdebug.LineBreakpoint(fileUri, line);
        }
      })
    );

    const vscodeBreakpoints: DebugProtocol.Breakpoint[] = [];
    await Promise.all(
      xdebugBreakpoints.map(async (breakpoint, index) => {
        try {
          await this._connection.sendBreakpointSetCommand(breakpoint);
          vscodeBreakpoints[index] = { verified: true, line: breakpoint.line };
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

    const stackFrames = await Promise.all(
      stack.stack.map(
        async (stackFrame: xdebug.StackFrame, index): Promise<StackFrame> => {
          const [, namespace, name] = decodeURI(stackFrame.fileUri).match(/^dbgp:\/\/\|([^|]+)\|(.*)$/);
          const routine = name;
          // const routine = name.includes(".") ? name : name + ".int";
          const fileUri = DocumentContentProvider.getUri(routine, null, namespace).toString();
          const source = new Source(routine, fileUri);
          let line = stackFrame.line + 1;
          if (source.name.endsWith(".cls") && stackFrame.method !== "") {
            line = await vscode.workspace.openTextDocument(vscode.Uri.parse(source.path)).then(document => {
              const methodMatchPattern = new RegExp(`^(Class)?Method ${stackFrame.method}(?=[( ])`, "i");
              for (let i = 0; i < document.lineCount; i++) {
                const line = document.lineAt(i);

                const methodMatch = line.text.match(methodMatchPattern);
                if (methodMatch) {
                  return i + 2 + stackFrame.methodOffset;
                }
              }
            });
          }
          const place = `${stackFrame.method}+${stackFrame.methodOffset}`;
          const stackFrameId = this._stackFrameIdCounter++;
          this._stackFrames.set(stackFrameId, stackFrame);
          return {
            id: stackFrameId,
            name: place,
            source,
            line,
            column: 1,
          };
        }
      )
    );

    response.body = {
      stackFrames,
    };
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
    scopes = contexts.map(context => {
      const variableId = this._variableIdCounter++;
      this._contexts.set(variableId, context);
      return new Scope(context.name, variableId);
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
    variables = properties.map(property => {
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
    this._checkStatus(xdebugResponse);

    this.sendResponse(response);
  }

  protected async stepInRequest(
    response: DebugProtocol.StepInResponse,
    args: DebugProtocol.StepInArguments
  ): Promise<void> {
    const xdebugResponse = await this._connection.sendStepIntoCommand();
    this._checkStatus(xdebugResponse);

    this.sendResponse(response);
  }

  protected async stepOutRequest(
    response: DebugProtocol.StepOutResponse,
    args: DebugProtocol.StepOutArguments
  ): Promise<void> {
    const xdebugResponse = await this._connection.sendStepOutCommand();
    this._checkStatus(xdebugResponse);

    this.sendResponse(response);
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
        // variablesReference = this._variableIdCounter++;
        // this._evalResultProperties.set(variablesReference, result);
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
      property = properties.find(el => el.name === name);
    } else if (this._properties.has(variablesReference)) {
      // VS Code is requesting the subelements for a variable, so we have to do a property_get
      property = this._properties.get(variablesReference);
    }
    property.value = value;
    await this._connection.sendPropertySetCommand(property);

    response.body = {
      value: args.value,
      variablesReference: args.variablesReference,
    };
    this.sendResponse(response);
  }
}
