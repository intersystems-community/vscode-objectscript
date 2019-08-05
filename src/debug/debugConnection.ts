// tslint:disable: max-classes-per-file
import { Disposable } from "vscode";
import WebSocket = require("ws");
import xmldom = require("xmldom");

export class ObjectScriptDebugConnection implements Disposable {
  public fileUri: string;
  public protocolVersion: string;
  public language: string;
  public ideKey: string;
  public engineVersion: string;

  private _websocket: WebSocket;

  public constructor() {
    const url = "ws://localhost:57773/api/atelier/v3/%25SYS/debug?CacheUserName=_SYSTEM&CachePassword=SYS";
    this._websocket = new WebSocket(url);
    this._websocket.on("message", (message: string) => {
      const buff = new Buffer(message.split("|")[1], "base64");
      const xml = buff.toString("ascii");
      const doc = new xmldom.DOMParser().parseFromString(xml);
      this.processResponse(doc);
    });
  }

  public dispose() {
    this._websocket.close();
  }

  private processResponse(response: XMLDocument) {
    if (response.documentElement.nodeName === "init") {
      this.init(response);
    }
  }

  private init(document: XMLDocument) {
    const documentElement = document.documentElement;
    this.fileUri = documentElement.getAttribute("fileuri");
    this.language = documentElement.getAttribute("language");
    this.protocolVersion = documentElement.getAttribute("protocol_version");
    this.ideKey = documentElement.getAttribute("idekey");
  }
}
