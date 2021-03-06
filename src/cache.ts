import * as api from './api';
import * as async from './async';
import * as util from './util';
import {Maybe} from './util';

export class Entry implements api.CacheEntry {
  private _type: api.EntryType = api.EntryType.Uninitialized;
  private _docs: string = '';
  private _key: string = '';
  private _value: any = null;
  private _advanced: boolean = false;

  public get type() {
    return this._type;
  }

  public get helpString() {
    return this._docs;
  }

  public get key() {
    return this._key;
  }

  public get value() {
    return this._value;
  }

  public as<T>(): T {
    return this.value as T;
  }

  public get advanced() {
    return this._advanced;
  }

  constructor(
      key: string, value: string, type: api.EntryType, docs: string,
      advanced: boolean) {
    this._key = key;
    this._type = type;
    if (type == api.EntryType.Bool) {
      this._value = util.isTruthy(value);
    } else {
      this._value = value;
    }
    this._docs = docs;
    this._advanced = advanced;
  }
};

export class CMakeCache {
  private _entries: Map<string, Entry>;

  public static async fromPath(path: string): Promise<CMakeCache> {
    const exists = await async.exists(path);
    if (exists) {
      const content = await async.readFile(path);
      const entries = await CMakeCache.parseCache(content.toString());
      return new CMakeCache(path, exists, entries);
    } else {
      return new CMakeCache(path, exists, new Map());
    }
  }

  allEntries(): Entry[] {
    return Array.from(this._entries.values());
  }

  constructor(path: string, exists: boolean, entries: Map<string, Entry>) {
    this._entries = entries;
    this._path = path;
    this._exists = exists;
  }

  private _exists: boolean = false;
  public get exists() {
    return this._exists;
  }

  private _path: string = '';
  public get path() {
    return this._path;
  }

  public getReloaded(): Promise<CMakeCache> {
    return CMakeCache.fromPath(this.path);
  }

  public static parseCache(content: string): Map<string, Entry> {
    const lines = content.split(/\r\n|\n|\r/)
                      .filter(line => !!line.length)
                      .filter(line => !/^\s*#/.test(line));

    const entries = new Map<string, Entry>();
    let docs_acc = '';
    for (const line of lines) {
      if (line.startsWith('//')) {
        docs_acc += /^\/\/(.*)/.exec(line)![1] + ' ';
      } else {
        const match = /^(.*?):(.*?)=(.*)/.exec(line);
        console.assert(
            !!match, 'Couldn\'t handle reading cache entry: ' + line);
        const [_, name, typename, valuestr] = match!;
        if (!name || !typename) continue;
        if (name.endsWith('-ADVANCED') && valuestr === '1') {
          // We skip the ADVANCED property variables. They're a little odd.
        } else {
          const key = name;
          const type: api.EntryType = {
            BOOL: api.EntryType.Bool,
            STRING: api.EntryType.String,
            PATH: api.EntryType.Path,
            FILEPATH: api.EntryType.FilePath,
            INTERNAL: api.EntryType.Internal,
            UNINITIALIZED: api.EntryType.Uninitialized,
            STATIC: api.EntryType.Static,
          }[typename];
          const docs = docs_acc.trim();
          docs_acc = '';
          console.assert(
              type !== undefined, `Unknown cache entry type: ${type}`);
          entries.set(name, new Entry(key, valuestr, type, docs, false));
        }
      }
    }

    return entries;
  }

  public get(key: string, defaultValue?: any): Maybe<Entry> {
    return this._entries.get(key) || null;
  }
}