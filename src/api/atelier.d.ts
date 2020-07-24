/**
 * Atelier API
 */

interface ResponseStatus {
  errors: string[];
  summary: string;
}

interface Content<T> {
  content: T;
}

export interface Response<T = any> {
  status: ResponseStatus;
  console: string[];
  result: T;
}

interface ServerInfoFeature {
  name: string;
  enabled: string;
}

export interface Document {
  name: string;
  db: string;
  ts: string;
  upd: boolean;
  cat: "RTN" | "CLS" | "CSP" | "OTH";
  status: string;
  enc: boolean;
  flags: number;
  content: string[] | Buffer;
  ext: string;
}

export interface ServerInfo {
  version: string;
  id: string;
  api: number;
  features: ServerInfoFeature[];
  namespaces: string[];
}

export interface SearchMatch {
  text: string;
  line?: number;
  member?: string;
  attr?: string;
  attrline?: number;
}

export interface SearchResult {
  doc: string;
  matches: SearchMatch[];
}

export interface AtelierJob {
  pid: number;
  namespace: string;
  routine: string;
  state: string;
  device: string;
}

export interface DeleteStatus {
  name: string;
  db: string;
  status: string;
}
