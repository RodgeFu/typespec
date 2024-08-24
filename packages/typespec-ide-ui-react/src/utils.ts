export function escapeIdString(id: string): string {
  return id.replace(/[^a-zA-Z0-9-_]/g, "_");
}

export function updateMap<T>(map: Map<string, T>, key: string, value: T) {
  if (value === undefined) {
    map.delete(key);
  } else {
    map.set(key, value);
  }
}

export function numberToInt(value: number): number {
  return value | 0;
}

export function anythingToString(item: any): string {
  if (item === undefined) {
    return "(undefined)";
  } else if (item === null) {
    return "(null)";
  } else if (typeof item === "string") {
    return item;
  } else if (typeof item === "object") {
    return JSON.stringify(item, undefined, 2);
  } else {
    return item.toString();
  }
}
