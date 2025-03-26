import { EventEmitter } from "events";
import * as WebSocket from "ws";
import * as iconv from "iconv-lite";
import { DOMParser } from "@xmldom/xmldom";

/** The encoding all XDebug messages are encoded with */
export const ENCODING = "iso-8859-1";

/** The two states the connection switches between */
enum ParsingState {
  DataLength,
  Response,
}

/** Wraps the NodeJS Socket and calls handleResponse() whenever a full response arrives */
export class DbgpConnection extends EventEmitter {
  private _socket: WebSocket;
  private _parsingState: ParsingState;
  private _chunksDataLength: number;
  private _chunks: Buffer[];
  private _dataLength: number;
  private _parser: DOMParser;
  private _messages: Buffer[] = [];
  private _processingMessages = false;

  public constructor(socket: WebSocket) {
    super();
    this._socket = socket;
    this._parsingState = ParsingState.DataLength;
    this._chunksDataLength = 0;
    this._chunks = [];
    socket.on("message", (data: string): void => {
      this._messages.push(Buffer.from(data));
      if (!this._processingMessages) {
        this._processingMessages = true;
        this._handleDataChunk();
        this._processingMessages = false;
      }
    });
    socket.on("error", (error: Error): boolean => this.emit("error", error));
    socket.on("close", (): boolean => this.emit("close"));
    this._parser = new DOMParser({
      onError: (level, msg) => {
        if (level == "warning") {
          this.emit("warning", msg);
        } else {
          this.emit("error", new Error(msg));
        }
      },
    });
  }

  public write(command: Buffer): Promise<void> {
    return new Promise<void>((resolve): void => {
      this._socket.send(command, (): void => {
        resolve();
      });
    });
  }

  /** closes the underlying socket */
  public close(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._socket.once("close", resolve);
      this._socket.close();
    });
  }

  private _handleDataChunk() {
    if (!this._messages.length) return; // Shouldn't ever happen
    const data: Buffer = this._messages.shift();
    if (this._parsingState === ParsingState.DataLength) {
      // does data contain a NULL byte?
      const separatorIndex = data.indexOf("|");
      if (separatorIndex !== -1) {
        // YES -> we received the data length and are ready to receive the response
        const lastPiece = data.slice(0, separatorIndex);
        this._chunks.push(lastPiece);
        this._chunksDataLength += lastPiece.length;
        this._dataLength = parseInt(iconv.decode(Buffer.concat(this._chunks, this._chunksDataLength), ENCODING));
        // reset buffered chunks
        this._chunks = [];
        this._chunksDataLength = 0;
        // switch to response parsing state
        this._parsingState = ParsingState.Response;
        // if data contains more info (except the NULL byte)
        if (data.length > separatorIndex + 1) {
          // handle the rest of the packet as part of the response
          const rest = data.slice(separatorIndex + 1, this._dataLength + separatorIndex + 1);
          this._messages.unshift(rest);
          this._handleDataChunk();
          // more then one data chunk in one message
          const restData = data.slice(this._dataLength + separatorIndex + 1);
          if (restData.length) {
            this._messages.unshift(restData);
            this._handleDataChunk();
          }
        }
      } else {
        // NO -> this is only part of the data length. We wait for the next data event
        this._chunks.push(data);
        this._chunksDataLength += data.length;
      }
    } else if (this._parsingState === ParsingState.Response) {
      // does the new data together with the buffered data add up to the data length?
      if (this._chunksDataLength + data.length >= this._dataLength) {
        // YES -> we received the whole response
        // append the last piece of the response
        const lastResponsePiece = data.slice(0, this._dataLength - this._chunksDataLength);
        this._chunks.push(lastResponsePiece);
        this._chunksDataLength += lastResponsePiece.length;
        const response = Buffer.concat(this._chunks, this._chunksDataLength).toString("ascii");
        // call response handler
        const xml = iconv.decode(Buffer.from(response, "base64"), ENCODING);
        const document = this._parser.parseFromString(xml, "application/xml");
        this.emit("message", document);
        // reset buffer
        this._chunks = [];
        this._chunksDataLength = 0;
        // switch to data length parsing state
        this._parsingState = ParsingState.DataLength;
        // if data contains more info
        if (data.length > lastResponsePiece.length) {
          // handle the rest of the packet as data length
          const rest = data.slice(lastResponsePiece.length);
          this._messages.unshift(rest);
          this._handleDataChunk();
        }
      } else {
        // NO -> this is not the whole response yet. We buffer it and wait for the next data event.
        this._chunks.push(data);
        this._chunksDataLength += data.length;
      }
    }
    while (this._messages.length) this._handleDataChunk();
  }
}
