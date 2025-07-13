import { ChatMessage } from "@typespec/compiler/internals";
import { LmResponseBasic } from "./types.js";

export class LmCache {
  private _cache: Map<string, unknown> = new Map();

  constructor() {}

  private msgToKey(messages: ChatMessage[]): string {
    return messages.map((msg) => `${msg.role}:${msg.message}`).join("|");
  }

  getForMsg<T extends LmResponseBasic>(key: ChatMessage[]): T | undefined {
    const keyString = this.msgToKey(key);
    return this._cache.get(keyString) as T | undefined;
  }

  setForMsg<T extends LmResponseBasic>(key: ChatMessage[], value: T): void {
    const keyString = this.msgToKey(key);
    this._cache.set(keyString, value);
  }

  hasForMsg(key: ChatMessage[]): boolean {
    const keyString = this.msgToKey(key);
    return this._cache.has(keyString);
  }
}
