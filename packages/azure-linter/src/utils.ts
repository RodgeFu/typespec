import { jsonrepair } from "jsonrepair";
import { ZodType } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { logger } from "./log/logger.js";

export function tryParseConnectionString(cs: string) {
  const result: Record<string, string> = {};
  cs.split(";").forEach((part) => {
    const index = part.indexOf("=");
    if (index < 0) {
      logger.error(`Invalid connection string: ${cs}`);
      return undefined;
    }
    const key = part.substring(0, index).trim();
    const value = part.substring(index + 1).trim();
    if (!key || !value) {
      logger.error(`Invalid connection string: ${cs}`);
      return undefined;
    }
    result[key] = value;
  });
  return result;
}

export function tryRepairAndParseJson(jsonStr: string | undefined): any | undefined {
  if (!jsonStr) {
    return undefined;
  }
  let cleaned = jsonStr.trim();

  // Remove triple backticks at the start and end
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(\w*\n)?/, "");
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.replace(/```$/, "");
  }

  try {
    cleaned = jsonrepair(cleaned);
    const parsed = JSON.parse(cleaned);
    return parsed;
  } catch (e) {
    logger.error(`Error to repare and parsing JSON: ${e}`);
    return undefined;
  }
}

export function toJsonSchemaString(obj: ZodType) {
  return JSON.stringify(zodToJsonSchema(obj), undefined, 2);
}
