import { ChatMessage } from "@typespec/compiler/internals";
import z from "zod";
import { getRecordValue, setRecordValue, tryReadJsonFile, tryWriteFile } from "../utils.js";
import { LmResponseBasic } from "./types.js";

const zLmCacheEntry = z.object({
  msgKey: z.string().describe("The key for the message, joined by role and message content"),
  value: z.any().describe("The cached value, should match the expected response type"),
});

const zLmCache = z
  .record(z.string().describe("The unique identifier of the caller for the cached response"), z.array(zLmCacheEntry))
  .describe("Map of cached responses keyed by a unique identifier");

type LmCacheEntry = z.infer<typeof zLmCacheEntry>;
type LmCacheMap = z.infer<typeof zLmCache>;

const MAX_LM_CACHE_SIZE_PER_KEY = 3;

// TODO: consider moveing this to lower level under lmProvider
class LmCache {
  private _cache: LmCacheMap = {};
  private _cacheFilePath?: string;
  private _cacheFileLoaded = false;

  constructor() {}

  setCacheFilePath(cacheFilePath: string) {
    this._cacheFilePath = cacheFilePath;
    this._cacheFileLoaded = false;

    // consider hook on process exit to flush the cache to file
    // now we will flush to cache file on every set operation for simplicity
    // which should be ignoreable comparing the to actual lm request calls
  }

  private async ensureCacheFileLoaded() {
    if (this._cacheFileLoaded) return;
    await this.loadFromCacheFile();
    this._cacheFileLoaded = true;
  }

  private generateMessageKey(key: string, messages: ChatMessage[]): string {
    const msgPart = messages.map((msg) => `${msg.role}:${msg.message}`).join("|");
    return `${key}->${msgPart}`;
  }

  async getForMsg<T extends LmResponseBasic>(callerKey: string, msg: ChatMessage[]): Promise<T | undefined> {
    await this.ensureCacheFileLoaded();

    const callerCache = getRecordValue(this._cache, callerKey);
    if (!callerCache) {
      return undefined;
    } else {
      const msgKey = this.generateMessageKey(callerKey, msg);
      const entry = callerCache.find((e) => e.msgKey === msgKey);
      if (entry) {
        return entry.value as T;
      }
      return undefined;
    }
  }

  async setForMsg<T extends LmResponseBasic>(callerKey: string, msg: ChatMessage[], value: T) {
    await this.ensureCacheFileLoaded();

    const msgKey = this.generateMessageKey(callerKey, msg);
    const entry: LmCacheEntry = { msgKey, value };

    const foundCallerEntry = getRecordValue(this._cache, callerKey);
    if (!foundCallerEntry) {
      setRecordValue(this._cache, callerKey, [entry]);
    } else {
      const found = foundCallerEntry.findIndex((e) => e.msgKey === msgKey);
      if (found >= 0) {
        foundCallerEntry.splice(found, 1);
      }
      foundCallerEntry.push(entry);
      if (foundCallerEntry.length > MAX_LM_CACHE_SIZE_PER_KEY) {
        foundCallerEntry.shift();
      }
    }
    await this.flushToFile();
  }

  private async flushToFile() {
    if (!this._cacheFilePath) return;
    tryWriteFile(this._cacheFilePath, JSON.stringify(this._cache, null, 2));
  }

  private async loadFromCacheFile() {
    if (!this._cacheFilePath) {
      this._cache = {};
      return;
    }
    const parsed = await tryReadJsonFile(this._cacheFilePath, zLmCache);
    this._cache = parsed ?? {};
  }
}

export async function initLmCache(cacheFilePath: string) {
  await lmCache.setCacheFilePath(cacheFilePath);
}

export const lmCache = new LmCache();
