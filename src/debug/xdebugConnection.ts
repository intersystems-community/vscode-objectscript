import * as iconv from "iconv-lite";
import * as WebSocket from "ws";
import { DbgpConnection } from "./dbgp";

/** The encoding all XDebug messages are encoded with */
const ENCODING = "iso-8859-1";

/** The first packet we receive from XDebug. Returned by waitForInitPacket() */
export class InitPacket {
  /** The file that was requested as a file:// URI */
  public fileUri: string;
  /** GDGP version (1.0) */
  public protocolVersion: string;
  public language: string;
  /** an IDE key, by default the PC name */
  public ideKey: string;
  /** a reference to the connection this packet was received from */
  public connection: Connection;
  /** the version of XDebug */
  public engineVersion: string;
  /**
   * @param  {XMLDocument} document - An XML document to read from
   * @param  {Connection} connection
   */
  public constructor(document: XMLDocument, connection: Connection) {
    const documentElement = document.documentElement;
    this.fileUri = documentElement.getAttribute("fileuri");
    this.language = documentElement.getAttribute("language");
    this.protocolVersion = documentElement.getAttribute("protocol_version");
    this.ideKey = documentElement.getAttribute("idekey");
    this.engineVersion = documentElement.getElementsByTagName("engine")[0].getAttribute("version");
    this.connection = connection;
  }
}

/** Error class for errors returned from XDebug */
export class XDebugError extends Error {
  public code: number;
  public constructor(message: string, code: number) {
    super(message);
    this.code = code;
    this.message = message;
    this.name = "XDebugError";
  }
}

/** The base class for all XDebug responses to commands executed on a connection */
export class Response {
  /** A unique transaction ID that matches the one in the request */
  public transactionId: number;
  /** The command that this is an answer for */
  public command: string;
  /** The connection this response was received from */
  public connection: Connection;
  /**
   * contructs a new Response object from an XML document.
   * If there is an error child node, an exception is thrown with the appropiate code and message.
   * @param  {XMLDocument} document - An XML document to read from
   * @param  {Connection} connection
   */
  public constructor(document: XMLDocument, connection: Connection) {
    const documentElement = document.documentElement;
    if (documentElement.firstChild && documentElement.firstChild.nodeName === "error") {
      const errorNode = documentElement.firstChild as Element;
      const code = parseInt(errorNode.getAttribute("code"), 10);
      const message = errorNode.textContent;
      throw new XDebugError(message, code);
    }
    this.transactionId = parseInt(documentElement.getAttribute("transaction_id"), 10);
    this.command = documentElement.getAttribute("command");
    this.connection = connection;
  }
}

/** A response to the status command */
export class StatusResponse extends Response {
  /** The current status. Can be 'break', ... */
  public status: string;
  /** The reason for being in this status, can be 'ok', ... */
  public reason: string;
  /** Contains the file URI if the status is 'break' */
  public fileUri: string;
  /** Contains the line number if the status is 'break' */
  public line: number;
  /** Contains info about the exception if the reason for breaking was an exception */
  public exception: {
    name: string;
    message: string;
    code?: number;
  };
  public constructor(document: XMLDocument, connection: Connection) {
    super(document, connection);
    const documentElement = document.documentElement;
    this.status = documentElement.getAttribute("status");
    this.reason = documentElement.getAttribute("reason");
    if (documentElement.hasChildNodes()) {
      const messageNode = documentElement.firstChild as Element;
      if (messageNode.hasAttribute("exception")) {
        this.exception = {
          message: messageNode.textContent,
          name: messageNode.getAttribute("exception"),
        };
        if (messageNode.hasAttribute("code")) {
          this.exception.code = parseInt(messageNode.getAttribute("code"), 10);
        }
      }
      if (messageNode.hasAttribute("filename")) {
        this.fileUri = messageNode.getAttribute("filename");
      }
      if (messageNode.hasAttribute("lineno")) {
        this.line = parseInt(messageNode.getAttribute("lineno"), 10);
      }
    }
  }
}

export type BreakpointType = "line" | "return" | "conditional" | "watch";
export type BreakpointState = "enabled" | "disabled";

/** Abstract base class for all breakpoints */
export abstract class Breakpoint {
  /** dynamically detects the type of breakpoint and returns the appropiate object */
  public static fromXml(breakpointNode: Element, connection: Connection): Breakpoint {
    switch (breakpointNode.getAttribute("type")) {
      case "line":
        return new LineBreakpoint(breakpointNode, connection);
      case "conditional":
        return new ConditionalBreakpoint(breakpointNode, connection);
      case "watch":
        return new Watchpoint(breakpointNode, connection);
      default:
        throw new Error(`Invalid type ${breakpointNode.getAttribute("type")}`);
    }
  }
  /** Unique ID which is used for modifying the breakpoint (only when received through breakpoint_list) */
  public id: number;
  /** The type of the breakpoint: line, call, return, exception, conditional or watch */
  public type: BreakpointType;
  /** State of the breakpoint: enabled, disabled */
  public state: BreakpointState;
  /** The connection this breakpoint is set on */
  public connection: Connection;
  /** The value of the `hitCondition` property of the input `DebugProtocol.SourceBreakpoint` */
  public hitCondition?: string;
  /** Constructs a breakpoint object from an XML node from a XDebug response */
  public constructor(breakpointNode: Element, connection: Connection);
  /** To create a new breakpoint in derived classes */
  public constructor(type: BreakpointType, hitCondition?: string);
  public constructor(...rest: any[]) {
    if (typeof rest[0] === "object") {
      // from XML
      const breakpointNode: Element = rest[0];
      this.connection = rest[1];
      this.type = breakpointNode.getAttribute("type") as BreakpointType;
      this.id = parseInt(breakpointNode.getAttribute("id"), 10);
      this.state = breakpointNode.getAttribute("state") as BreakpointState;
    } else {
      this.type = rest[0];
      if (rest[1] !== undefined) {
        this.hitCondition = rest[1].trim();
      }
      this.state = "enabled";
    }
  }
  /** Removes the breakpoint by sending a breakpoint_remove command */
  public remove(): Promise<Response> {
    return this.connection.sendBreakpointRemoveCommand(this);
  }
}

/** class for line breakpoints. Returned from a breakpoint_list or passed to sendBreakpointSetCommand */
export class LineBreakpoint extends Breakpoint {
  /** File URI of the file in which to break */
  public fileUri: string;
  /** Line to break on */
  public line: number;
  /** constructs a line breakpoint from an XML node */
  public constructor(breakpointNode: Element, connection: Connection);
  /** contructs a line breakpoint for passing to sendSetBreakpointCommand */
  public constructor(fileUri: string, line: number, hitCondition?: string);
  public constructor(...rest: any[]) {
    if (typeof rest[0] === "object") {
      const breakpointNode: Element = rest[0];
      const connection: Connection = rest[1];
      super(breakpointNode, connection);
      this.line = parseInt(breakpointNode.getAttribute("lineno"), 10);
      this.fileUri = breakpointNode.getAttribute("filename");
    } else {
      // construct from arguments
      super("line", rest[2]);
      this.fileUri = rest[0];
      this.line = rest[1];
    }
  }
}

export class ClassLineBreakpoint extends LineBreakpoint {
  public method: string;
  public methodOffset: number;

  /** contructs a line breakpoint for passing to sendSetBreakpointCommand */
  public constructor(fileUri: string, line: number, method: string, methodOffset: number, hitCondition?: string);
  public constructor(...rest: any[]) {
    if (typeof rest[0] === "object") {
      const breakpointNode: Element = rest[0];
      const connection: Connection = rest[1];
      super(breakpointNode, connection);
      this.line = parseInt(breakpointNode.getAttribute("lineno"), 10);
      this.fileUri = breakpointNode.getAttribute("filename");
    } else {
      super(rest[0], rest[1], rest[4]);
      this.method = rest[2];
      this.methodOffset = rest[3];
    }
  }
}

export class RoutineLineBreakpoint extends LineBreakpoint {
  public method: string;
  public methodOffset: number;

  /** contructs a line breakpoint for passing to sendSetBreakpointCommand */
  public constructor(fileUri: string, line: number, method: string, methodOffset: number, hitCondition?: string);
  public constructor(...rest: any[]) {
    if (typeof rest[0] === "object") {
      const breakpointNode: Element = rest[0];
      const connection: Connection = rest[1];
      super(breakpointNode, connection);
      this.line = parseInt(breakpointNode.getAttribute("lineno"), 10);
      this.fileUri = breakpointNode.getAttribute("filename");
    } else {
      super(rest[0], rest[1], rest[4]);
      this.method = rest[2];
      this.methodOffset = rest[3];
    }
  }
}

/** class for conditional breakpoints. Returned from a breakpoint_list or passed to sendBreakpointSetCommand */
export class ConditionalBreakpoint extends Breakpoint {
  /** File URI */
  public fileUri: string;
  /** Line (optional) */
  public line: number;
  /** The expression under which to break on */
  public expression: string;
  /** Constructs a breakpoint object from an XML node from a XDebug response */
  public constructor(breakpointNode: Element, connection: Connection);
  /** Contructs a breakpoint object for passing to sendSetBreakpointCommand */
  public constructor(expression: string, fileUri: string, line?: number, hitCondition?: string);
  public constructor(...rest: any[]) {
    if (typeof rest[0] === "object") {
      // from XML
      const breakpointNode: Element = rest[0];
      const connection: Connection = rest[1];
      super(breakpointNode, connection);
      this.expression = breakpointNode.getAttribute("expression"); // Base64 encoded?
    } else {
      // from arguments
      super("conditional", rest[3]);
      this.expression = rest[0];
      this.fileUri = rest[1];
      this.line = rest[2];
    }
  }
}

export class ClassConditionalBreakpoint extends ConditionalBreakpoint {
  public method: string;
  public methodOffset: number;

  /** contructs a conditional breakpoint for passing to sendSetBreakpointCommand */
  public constructor(
    expression: string,
    fileUri: string,
    line: number,
    method: string,
    methodOffset: number,
    hitCondition?: string
  );
  public constructor(...rest: any[]) {
    if (typeof rest[0] === "object") {
      const breakpointNode: Element = rest[0];
      const connection: Connection = rest[1];
      super(breakpointNode, connection);
      this.expression = breakpointNode.getAttribute("expression"); // Base64 encoded?
    } else {
      super(rest[0], rest[1], rest[2], rest[5]);
      this.method = rest[3];
      this.methodOffset = rest[4];
    }
  }
}

export class RoutineConditionalBreakpoint extends ConditionalBreakpoint {
  public method: string;
  public methodOffset: number;

  /** contructs a conditional breakpoint for passing to sendSetBreakpointCommand */
  public constructor(
    expression: string,
    fileUri: string,
    line: number,
    method: string,
    methodOffset: number,
    hitCondition?: string
  );
  public constructor(...rest: any[]) {
    if (typeof rest[0] === "object") {
      const breakpointNode: Element = rest[0];
      const connection: Connection = rest[1];
      super(breakpointNode, connection);
      this.expression = breakpointNode.getAttribute("expression"); // Base64 encoded?
    } else {
      super(rest[0], rest[1], rest[2], rest[5]);
      this.method = rest[3];
      this.methodOffset = rest[4];
    }
  }
}

/** class for watch breakpoints. Returned from a breakpoint_list or passed to sendBreakpointSetCommand */
export class Watchpoint extends Breakpoint {
  /** The variable to watch */
  public variable: string;
  /** The expression under which to break on */
  public expression?: string;
  /** Constructs a breakpoint object from an XML node from a XDebug response */
  public constructor(breakpointNode: Element, connection: Connection);
  /** Contructs a breakpoint object for passing to sendSetBreakpointCommand */
  public constructor(variable: string, expression?: string);
  public constructor(...rest: any[]) {
    if (typeof rest[0] === "object") {
      // from XML
      const breakpointNode: Element = rest[0];
      const connection: Connection = rest[1];
      super(breakpointNode, connection);
      const expr = breakpointNode.getAttribute("expression"); // Base64 encoded?
      if (expr.includes("|")) {
        this.variable = expr.slice(0, expr.indexOf("|"));
        this.expression = expr.slice(expr.indexOf("|") + 1);
      } else {
        this.variable = expr;
      }
    } else {
      // from arguments
      super("watch");
      this.variable = rest[0];
      this.expression = rest[1];
    }
  }
}

/** Response to a breakpoint_set command */
export class BreakpointSetResponse extends Response {
  public breakpointId: number;
  public constructor(document: XMLDocument, connection: Connection) {
    super(document, connection);
    this.breakpointId = parseInt(document.documentElement.getAttribute("id"), 10);
  }
}

/** The response to a breakpoint_list command */
export class BreakpointListResponse extends Response {
  /** The currently set breakpoints for this connection */
  public breakpoints: Breakpoint[];
  /**
   * @param  {XMLDocument} document
   * @param  {Connection} connection
   */
  public constructor(document: XMLDocument, connection: Connection) {
    super(document, connection);
    this.breakpoints = Array.from(document.documentElement.childNodes).map(
      (breakpointNode: Element): Breakpoint => Breakpoint.fromXml(breakpointNode, connection)
    );
  }
}

/** One stackframe inside a stacktrace retrieved through stack_get */
export class StackFrame {
  /** The method name for class */
  public method: string;
  /** The type of stack frame. Valid values are "file" and "eval" */
  public type: string;
  /** The file URI where the stackframe was entered */
  public fileUri: string;
  /** The line number inside file where the stackframe was entered */
  public line: number;
  /** The line number inside of method of class */
  public methodOffset: number;
  /** The start line number of the current command */
  public cmdBeginLine?: number;
  /** The start position of the current command within the line */
  public cmdBeginPos?: number;
  /** The end line number of the current command */
  public cmdEndLine?: number;
  /** The end position of the current command within the line */
  public cmdEndPos?: number;
  /** The level (index) inside the stack trace at which the stack frame receides */
  public level: number;
  /** The connection this stackframe belongs to */
  public connection: Connection;
  /**
   * @param  {Element} stackFrameNode
   * @param  {Connection} connection
   */
  public constructor(stackFrameNode: Element, connection: Connection) {
    this.method = iconv.encode(stackFrameNode.getAttribute("method"), ENCODING) + "";
    this.fileUri = iconv.encode(stackFrameNode.getAttribute("filename"), ENCODING) + "";
    this.type = stackFrameNode.getAttribute("type");
    this.line = parseInt(stackFrameNode.getAttribute("lineno"), 10);
    this.methodOffset = parseInt(stackFrameNode.getAttribute("methodoffset"), 10);
    this.level = parseInt(stackFrameNode.getAttribute("level"), 10);
    const cmdBegin = stackFrameNode.getAttribute("cmdbegin");
    const cmdEnd = stackFrameNode.getAttribute("cmdend");
    if (cmdBegin && cmdEnd) {
      const [cmdBeginLine, cmdBeginPos] = cmdBegin.split(":");
      const [cmdEndLine, cmdEndPos] = cmdEnd.split(":");
      this.cmdBeginLine = parseInt(cmdBeginLine, 10);
      this.cmdBeginPos = parseInt(cmdBeginPos, 10);
      this.cmdEndLine = parseInt(cmdEndLine, 10);
      this.cmdEndPos = parseInt(cmdEndPos, 10);
    }
    this.connection = connection;
  }
  /** Returns the available contexts (scopes, such as "Local" and "Superglobals") by doing a context_names command */
  public async getContexts(): Promise<Context[]> {
    return (await this.connection.sendContextNamesCommand(this)).contexts;
  }
}

/** The response to a stack_get command */
export class StackGetResponse extends Response {
  /** The current stack trace */
  public stack: StackFrame[];
  /**
   * @param  {XMLDocument} document
   * @param  {Connection} connection
   */
  public constructor(document: XMLDocument, connection: Connection) {
    super(document, connection);
    this.stack = Array.from(document.documentElement.childNodes).map(
      (stackFrameNode: Element) => new StackFrame(stackFrameNode, connection)
    );
  }
}

export class SourceResponse extends Response {
  public source: string;
  public constructor(document: XMLDocument, connection: Connection) {
    super(document, connection);
    this.source = Buffer.from(document.documentElement.textContent, "base64").toString();
  }
}

/** A context inside a stack frame, like "Local" or "Superglobals" */
export class Context {
  /** Unique id that is used for further commands */
  public id: number;
  /** UI-friendly name like "Local" or "Superglobals" */
  public name: string;
  /** The stackframe this context belongs to */
  public stackFrame: StackFrame;
  /**
   * @param  {Element} contextNode
   * @param  {StackFrame} stackFrame
   */
  public constructor(contextNode: Element, stackFrame: StackFrame) {
    this.id = parseInt(contextNode.getAttribute("id"), 10);
    this.name = contextNode.getAttribute("name");
    this.stackFrame = stackFrame;
  }
  /**
   * Returns the properties (variables) inside this context by doing a context_get command
   * @returns Promise.<Property[]>
   */
  public async getProperties(): Promise<Property[]> {
    return (await this.stackFrame.connection.sendContextGetCommand(this)).properties;
  }
}

/** Response to a context_names command */
export class ContextNamesResponse extends Response {
  /** the available contexts inside the given stack frame */
  public contexts: Context[];
  /**
   * @param  {XMLDocument} document
   * @param  {StackFrame} stackFrame
   */
  public constructor(document: XMLDocument, stackFrame: StackFrame) {
    super(document, stackFrame.connection);
    this.contexts = Array.from(document.documentElement.childNodes).map(
      (contextNode: Element): Context => new Context(contextNode, stackFrame)
    );
  }
}

/** The parent for properties inside a scope and properties retrieved through eval requests */
export abstract class BaseProperty {
  /** the short name of the property */
  public name: string;
  /** the data type of the variable. Can be string, int, float, bool, array, object, uninitialized, null or resource  */
  public type: string;
  /** the class if the type is object */
  public class: string;
  /**
   * a boolean indicating wether children of this property can be received or not.
   * This is true for arrays and objects.
   */
  public hasChildren: boolean;
  /** the number of children this property has, if any. Useful for showing array length. */
  public numberOfChildren: number;
  /** the value of the property for primitive types */
  public value: string;
  /** children that were already included in the response */
  public children: BaseProperty[];

  public constructor(propertyNode: Element) {
    if (propertyNode.hasAttribute("name")) {
      this.name = iconv.encode(propertyNode.getAttribute("name"), ENCODING) + "";
    }
    this.type = propertyNode.getAttribute("type");
    if (propertyNode.hasAttribute("classname")) {
      this.class = propertyNode.getAttribute("classname");
    }
    this.hasChildren = !!parseInt(propertyNode.getAttribute("children"), 10);
    if (this.hasChildren) {
      this.numberOfChildren = parseInt(propertyNode.getAttribute("numchildren"), 10);
    } else {
      const encoding = propertyNode.getAttribute("encoding");
      if (encoding && encoding !== "none") {
        this.value = iconv.encode(propertyNode.textContent, encoding) + "";
      } else {
        this.value = iconv.encode(propertyNode.textContent, ENCODING) + "";
      }
    }
    if (this.value === "<UNDEFINED>") {
      this.value = undefined;
      this.type = "undefined";
    }
    if (this.type == "string" && Number(this.value).toString() === this.value) {
      this.type = this.value.includes(".") ? "float" : "int";
    }
  }
}

/** a property (variable) inside a context or a child of another property */
export class Property extends BaseProperty {
  /** the fully-qualified name of the property inside the context */
  public fullName: string;
  /** the context this property belongs to */
  public context: Context;

  public children: Property[];

  /**
   * @param  {Element} propertyNode
   * @param  {Context} context
   */
  public constructor(propertyNode: Element, context: Context) {
    super(propertyNode);
    this.fullName = propertyNode.getAttribute("fullname");
    this.context = context;
    if (this.hasChildren) {
      this.children = Array.from(propertyNode.childNodes).map(
        (propNode: Element): Property => new Property(propNode, context)
      );
    }
  }
  /**
   * Returns the child properties of this property by doing another property_get
   * @returns Promise.<Property[]>
   */
  public async getChildren(): Promise<Property[]> {
    if (!this.hasChildren) {
      throw new Error("This property has no children");
    }
    return (await this.context.stackFrame.connection.sendPropertyGetCommand(this)).children;
  }
}

/** The response to a context_get command */
export class ContextGetResponse extends Response {
  /** the available properties inside the context */
  public properties: Property[];
  /**
   * @param  {XMLDocument} document
   * @param  {Context} context
   */
  public constructor(document: XMLDocument, context: Context) {
    super(document, context.stackFrame.connection);
    this.properties = Array.from(document.documentElement.childNodes).map(
      (propertyNode: Element): Property => new Property(propertyNode, context)
    );
  }
}

/** The response to a property_get command */
export class PropertyGetResponse extends Response {
  /** the children of the given property */
  public children: Property[];
  /**
   * @param  {XMLDocument} document
   * @param  {Property} property
   */
  public constructor(document: XMLDocument, property: Property) {
    super(document, property.context.stackFrame.connection);
    this.children = Array.from(document.documentElement.firstChild.childNodes).map(
      (propertyNode: Element): Property => new Property(propertyNode, property.context)
    );
  }
}

/** The response to a property_set command */
export class PropertySetResponse extends Response {
  /** the children of the given property */
  public children: Property[];
  /**
   * @param  {XMLDocument} document
   * @param  {Property} property
   */
  public constructor(document: XMLDocument, property: Property) {
    super(document, property.context.stackFrame.connection);
    // this.children = Array.from(document.documentElement.firstChild.childNodes).map(
    //   (propertyNode: Element): Property => new Property(propertyNode, property.context)
    // );
  }
}

/**
 * class for properties returned from eval commands.
 * These don't have a full name or an ID, but have all children already inlined.
 */

export class EvalResultProperty extends BaseProperty {
  public children: EvalResultProperty[];
  public constructor(propertyNode: Element) {
    super(propertyNode);
    if (this.hasChildren) {
      this.children = Array.from(propertyNode.childNodes).map(
        (propNode: Element): EvalResultProperty => new EvalResultProperty(propNode)
      );
    }
  }
}

/** The response to an eval command */
export class EvalResponse extends Response {
  /** the result of the expression, if there was any */
  public result: EvalResultProperty;
  public constructor(document: XMLDocument, connection: Connection) {
    super(document, connection);
    if (document.documentElement.hasChildNodes()) {
      this.result = new EvalResultProperty(document.documentElement.firstChild as Element);
    }
  }
}

/** The response to an feature_set command */
export class FeatureSetResponse extends Response {
  /** the feature that was set */
  public feature: string;
  public constructor(document: XMLDocument, connection: Connection) {
    super(document, connection);
    this.feature = document.documentElement.getAttribute("feature");
  }
}

export class FeatureGetResponse extends Response {
  /** the feature that was get */
  public feature: string;
  /** supported flag for the feature */
  public supported: boolean;
  public constructor(document: XMLDocument, connection: Connection) {
    super(document, connection);
    this.feature = document.documentElement.getAttribute("feature");
    this.supported = document.documentElement.getAttribute("supported") === "1";
  }
}

/** A command inside the queue */
interface Command {
  /** The name of the command, like breakpoint_list */
  name: string;
  /** All arguments as one string */
  args?: string;
  /** Data that gets appended after an " -- " in base64 */
  data?: string;
  /** callback that gets called with an XML document when a response arrives that could be parsed */
  resolveFn: (response: XMLDocument) => any;
  /** callback that gets called if an error happened while parsing the response */
  rejectFn: (error?: Error) => any;
  /** whether command results in code being executed or not */
  isExecuteCommand: boolean;
}

/**
 * This class represents a connection to XDebug and is instantiated with a socket.
 */
export class Connection extends DbgpConnection {
  /**
   * Whether a command was started that executes code, which means the connection will be blocked from
   * running any additional commands until the execution gets to the next stopping point or exits.
   */
  public get isPendingExecuteCommand(): boolean {
    return this._pendingExecuteCommand;
  }
  /** a counter for unique connection IDs */
  private static _connectionCounter = 1;

  /** unique connection ID */
  public id: number;

  /** the time this connection was established */
  public timeEstablished: Date;

  /** a counter for unique transaction IDs. */
  private _transactionCounter = 1;

  /** the promise that gets resolved once we receive the init packet */
  private _initPromise: Promise<InitPacket>;

  /** resolves the init promise */
  private _initPromiseResolveFn: (initPackt: InitPacket) => any;

  /** rejects the init promise */
  private _initPromiseRejectFn: (err?: Error) => any;

  /**
   * a map from transaction IDs to pending commands that have been sent to XDebug and are awaiting a response.
   * This should in theory only contain max one element at any time.
   */
  private _pendingCommands = new Map<number, Command>();

  /**
   * XDebug does NOT support async communication.
   * This means before sending a new command, we have to wait until we get a response for the previous.
   * This array is a stack of commands that get passed to _sendCommand once XDebug can accept commands again.
   */
  private _commandQueue: Command[] = [];

  private _pendingExecuteCommand = false;

  /** Constructs a new connection that uses the given socket to communicate with XDebug. */
  public constructor(socket: WebSocket) {
    super(socket);
    this.id = Connection._connectionCounter++;
    this.timeEstablished = new Date();
    this._initPromise = new Promise<InitPacket>((resolve, reject): void => {
      this._initPromiseResolveFn = resolve;
      this._initPromiseRejectFn = reject;
    });
    this.on("message", (response: XMLDocument): void => {
      if (response.documentElement.nodeName === "init") {
        this._initPromiseResolveFn(new InitPacket(response, this));
      } else {
        const transactionId = parseInt(response.documentElement.getAttribute("transaction_id"), 10);
        if (this._pendingCommands.has(transactionId)) {
          const command = this._pendingCommands.get(transactionId);
          this._pendingCommands.delete(transactionId);
          this._pendingExecuteCommand = false;
          command.resolveFn(response);
        }
        if (this._commandQueue.length > 0) {
          const command = this._commandQueue.shift();
          this._executeCommand(command).catch(command.rejectFn);
        }
        if (response.documentElement.nodeName === "stream") {
          const type = response.documentElement.getAttribute("type");
          const data = Buffer.from(response.documentElement.textContent, "base64").toString();
          this.sendEvent(type, data);
        }
      }
    });
  }

  /** Returns a promise that gets resolved once the init packet arrives */
  public waitForInitPacket(): Promise<InitPacket> {
    return this._initPromise;
  }

  public close(): Promise<void> {
    this._commandQueue = [];
    this._initPromiseRejectFn(new Error("connection closed"));
    return super.close();
  }

  // ------------------------ status --------------------------------------------

  /** Sends a status command */
  public async sendStatusCommand(): Promise<StatusResponse> {
    return new StatusResponse(await this._enqueueCommand("status"), this);
  }

  // ------------------------ feature negotiation --------------------------------

  /**
   * Sends a feature_get command
   * feature can be one of
   *  - language_supports_threads
   *  - language_name
   *  - language_version
   *  - encoding
   *  - protocol_version
   *  - supports_async
   *  - data_encoding
   *  - breakpoint_languages
   *  - breakpoint_types
   *  - multiple_sessions
   *  - max_children
   *  - max_data
   *  - max_depth
   *  - extended_properties
   * optional features:
   *  - supports_postmortem
   *  - show_hidden
   *  - notify_ok
   * or any command.
   */
  public async sendFeatureGetCommand(feature: string): Promise<FeatureGetResponse> {
    return new FeatureGetResponse(await this._enqueueCommand("feature_get", `-n ${feature}`), this);
  }

  /**
   * Sends a feature_set command
   * feature can be one of
   *  - multiple_sessions
   *  - max_children
   *  - max_data
   *  - max_depth
   *  - extended_properties
   * optional features:
   *  - show_hidden
   *  - notify_ok
   */
  public async sendFeatureSetCommand(
    feature: string,
    value: string | number,
    base64 = false
  ): Promise<FeatureSetResponse> {
    const v =
      typeof value === "string" && base64 ? `-v_base64 ${Buffer.from(value).toString("base64")}` : `-v ${value}`;
    return new FeatureSetResponse(await this._enqueueCommand("feature_set", `-n ${feature} ${v}`), this);
  }

  // ---------------------------- breakpoints ------------------------------------

  /**
   * Sends a breakpoint_set command that sets a breakpoint.
   * @param {Breakpoint} breakpoint - an instance of LineBreakpoint, ConditionalBreakpoint, ExceptionBreakpoint or Watchpoint
   * @returns Promise.<BreakpointSetResponse>
   */
  public async sendBreakpointSetCommand(breakpoint: Breakpoint): Promise<BreakpointSetResponse> {
    let args = `-t ${breakpoint.type}`;
    let data: string | undefined;
    args += ` -s ${breakpoint.state}`;
    if (breakpoint instanceof LineBreakpoint) {
      args += ` -f ${breakpoint.fileUri}`;
      if (breakpoint instanceof ClassLineBreakpoint) {
        args += ` -m ${breakpoint.method} -n ${breakpoint.methodOffset}`;
      } else if (breakpoint instanceof RoutineLineBreakpoint) {
        args += ` -n ${breakpoint.methodOffset}`;
      } else {
        args += ` -n ${breakpoint.line}`;
      }
    } else if (breakpoint instanceof ConditionalBreakpoint) {
      args += ` -f ${breakpoint.fileUri}`;
      if (breakpoint instanceof ClassConditionalBreakpoint) {
        args += ` -m ${breakpoint.method} -n ${breakpoint.methodOffset}`;
      } else if (breakpoint instanceof RoutineConditionalBreakpoint) {
        args += ` -n ${breakpoint.methodOffset}`;
      }
      data = breakpoint.expression;
    } else if (breakpoint instanceof Watchpoint) {
      data = breakpoint.variable;
      if (breakpoint.expression != undefined) {
        data += "|" + breakpoint.expression;
      }

      // These placeholders are needed due to a bug on the server
      // They have no effect on the watchpoint functionality
      args += ` -f PLACEHOLDER`;
      args += ` -m PLACEHOLDER`;
      args += ` -n PLACEHOLDER`;
    }
    if (breakpoint.hitCondition) {
      args += ` -h ${breakpoint.hitCondition}`;
    }
    return new BreakpointSetResponse(await this._enqueueCommand("breakpoint_set", args, data), this);
  }

  /** sends a breakpoint_list command */
  public async sendBreakpointListCommand(): Promise<BreakpointListResponse> {
    return new BreakpointListResponse(await this._enqueueCommand("breakpoint_list"), this);
  }

  /** sends a breakpoint_remove command */
  public async sendBreakpointRemoveCommand(breakpoint: Breakpoint): Promise<Response> {
    return new Response(await this._enqueueCommand("breakpoint_remove", `-d ${breakpoint.id}`), this);
  }

  // ----------------------------- continuation ---------------------------------

  /** sends a run command */
  public async sendRunCommand(): Promise<StatusResponse> {
    return new StatusResponse(await this._enqueueExecuteCommand("run"), this);
  }

  /** sends a step_into command */
  public async sendStepIntoCommand(): Promise<StatusResponse> {
    return new StatusResponse(await this._enqueueExecuteCommand("step_into"), this);
  }

  /** sends a step_over command */
  public async sendStepOverCommand(): Promise<StatusResponse> {
    return new StatusResponse(await this._enqueueExecuteCommand("step_over"), this);
  }

  /** sends a step_out command */
  public async sendStepOutCommand(): Promise<StatusResponse> {
    return new StatusResponse(await this._enqueueExecuteCommand("step_out"), this);
  }

  /** sends a stop command */
  public async sendStopCommand(): Promise<StatusResponse> {
    return new StatusResponse(await this._immediateCommand("stop"), this);
  }

  /** sends an detach command */
  public async sendDetachCommand(): Promise<StatusResponse> {
    return new StatusResponse(await this._immediateCommand("detach"), this);
  }

  /** sends an break command */
  public async sendBreakCommand(): Promise<StatusResponse> {
    return new StatusResponse(await this._immediateCommand("break"), this);
  }

  // ------------------------------ stack ----------------------------------------

  /** Sends a stack_get command */
  public async sendStackGetCommand(): Promise<StackGetResponse> {
    return new StackGetResponse(await this._enqueueCommand("stack_get"), this);
  }

  public async sendSourceCommand(uri: string): Promise<SourceResponse> {
    return new SourceResponse(await this._enqueueCommand("source", `-f ${uri}`), this);
  }

  // ------------------------------ context --------------------------------------

  /** Sends a context_names command. */
  public async sendContextNamesCommand(stackFrame: StackFrame): Promise<ContextNamesResponse> {
    return new ContextNamesResponse(await this._enqueueCommand("context_names", `-d ${stackFrame.level}`), stackFrame);
  }

  /** Sends a context_get comand */
  public async sendContextGetCommand(context: Context): Promise<ContextGetResponse> {
    return new ContextGetResponse(
      await this._enqueueCommand("context_get", `-d ${context.stackFrame.level} -c ${context.id}`),
      context
    );
  }

  /** Sends a property_get command */
  public async sendPropertyGetCommand(property: Property): Promise<PropertyGetResponse> {
    const escapedFullName = '"' + property.fullName.replace(/("|\\)/g, "\\$1") + '"';
    return new PropertyGetResponse(
      await this._enqueueCommand(
        "property_get",
        `-d ${property.context.stackFrame.level} -c ${property.context.id} -n ${escapedFullName}`
      ),
      property
    );
  }

  /** Sends a property_get command */
  public async sendPropertySetCommand(property: Property): Promise<PropertySetResponse> {
    const value = Buffer.from(property.value).toString("base64");
    return new PropertySetResponse(
      await this._enqueueCommand(
        "property_set",
        `-d ${property.context.stackFrame.level} -n ${property.fullName} -- ${value}`
      ),
      property
    );
  }

  // ------------------------------- eval -----------------------------------------

  /** sends an eval command */
  public async sendEvalCommand(expression: string): Promise<EvalResponse> {
    return new EvalResponse(await this._enqueueCommand("eval", undefined, expression), this);
  }

  /**
   * Pushes a new command to the queue that will be executed after
   * all the previous commands have finished and we received a response.
   * If the queue is empty AND there are no pending transactions
   * (meaning we already received a response and XDebug is waiting for
   * commands) the command will be executed immediately.
   */
  private _enqueueCommand(name: string, args?: string, data?: string): Promise<XMLDocument> {
    return new Promise((resolveFn, rejectFn): void => {
      this._enqueue({
        name,
        args,
        data,
        resolveFn,
        rejectFn,
        isExecuteCommand: false,
      });
    });
  }

  private _immediateCommand(name: string, args?: string, data?: string): Promise<XMLDocument> {
    return new Promise((resolveFn, rejectFn): void => {
      this._executeCommand({
        name,
        args,
        data,
        resolveFn,
        rejectFn,
        isExecuteCommand: false,
      });
    });
  }

  /**
   * Pushes a new execute command (one that results in executing code)
   * to the queue that will be executed after all the previous
   * commands have finished and we received a response.
   * If the queue is empty AND there are no pending transactions
   * (meaning we already received a response and XDebug is waiting for
   * commands) the command will be executed immediately.
   */
  private _enqueueExecuteCommand(name: string, args?: string, data?: string): Promise<XMLDocument> {
    return new Promise((resolveFn, rejectFn) => {
      this._enqueue({
        name,
        args,
        data,
        resolveFn,
        rejectFn,
        isExecuteCommand: true,
      });
    });
  }

  /** Adds the given command to the queue, or executes immediately if no commands are currently being processed. */
  private _enqueue(command: Command): void {
    if (this._commandQueue.length === 0 && this._pendingCommands.size === 0) {
      this._executeCommand(command);
    } else {
      this._commandQueue.push(command);
    }
  }

  /**
   * Sends a command to XDebug with a new transaction ID and calls the callback on the command. This can
   * only be called when XDebug can actually accept commands, which is after we received a response for the
   * previous command.
   */
  private async _executeCommand(command: Command): Promise<void> {
    const transactionId = this._transactionCounter++;
    let commandString = command.name + " -i " + transactionId;
    if (command.args) {
      commandString += " " + command.args;
    }
    if (command.data) {
      commandString += " -- " + Buffer.from(command.data).toString("base64");
    }
    commandString += "\n";
    const data = iconv.encode(commandString, ENCODING);
    this._pendingCommands.set(transactionId, command);
    this._pendingExecuteCommand = command.isExecuteCommand;
    await this.write(data);
  }

  private sendEvent(event: string, ...args: any[]) {
    setImmediate((_) => {
      this.emit(event, ...args);
    });
  }
}
