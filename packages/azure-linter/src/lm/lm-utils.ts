import { ChatCompleteOptions, ChatMessage, LmProvider } from "@typespec/compiler/internals";
import { ZodType } from "zod";
import { logger } from "../log/logger.js";
import { toJsonSchemaString, tryRepairAndParseJson } from "../utils.js";
import { lmCache } from "./lm-cache.js";
import { LmErrorResponse, LmResponseBasic, zLmErrorResponse } from "./types.js";

// TODO: consider moveing this to lower level under lmProvider
// this will allow us to share more bewteen different lm providers and linter to avoid dup
// but will also need to make the lmProvider interface more specific especially for the response type
// but feels worth it
export async function askLanguageModeWithRetry<T extends LmResponseBasic>(
  provider: LmProvider,
  callerKey: string,
  messages: ChatMessage[],
  options: ChatCompleteOptions,
  responseZod: ZodType<T>,
  retryCount = 3,
): Promise<T | LmErrorResponse | undefined> {
  let attempt = 0;
  while (attempt < retryCount) {
    try {
      const result = await askLanguageModel(provider, callerKey, messages, options, responseZod);
      if (result !== undefined) {
        return result;
      }
    } catch (error) {
      logger.error(`Attempt ${attempt + 1} failed: ${error}`);
    }
    attempt++;
  }
  logger.error("All attempts to ask the language model failed");
  return undefined;
}

export async function askLanguageModel<T extends LmResponseBasic>(
  provider: LmProvider,
  callerKey: string,
  messages: ChatMessage[],
  options: ChatCompleteOptions,
  responseZod: ZodType<T>,
): Promise<T | LmErrorResponse | undefined> {
  // TODO: shall we consider the options and rseponse type for the cache?
  const fromCache = await lmCache.getForMsg<T>(callerKey, messages);
  if (fromCache) {
    logger.debug("Using cached result for messages: " + JSON.stringify(messages));
    return fromCache;
  }

  const responseSchemaMessage = `
  ** Important: You response MUST follow the RULEs below **
  - If there is error occures, you MUST reponse a valid JSON object that matches the schema: 
  \`\`\`json schema
  ${toJsonSchemaString(zLmErrorResponse)}
  \`\`\`
  - If there is no error occurs, you MUST response a valid JSON object or array that matches the schema: 
  \`\`\`json schema
  ${toJsonSchemaString(responseZod)}
  \`\`\`
  - There MUST NOT be any other text in the response, only the JSON object or array.
  - The JSON object or array MUST NOT be wrapped in triple backticks or any other formatting.
  - DOUBLE CHECK the JSON object or array before sending it back to ensure it is valid, follows the schema and all the required fields are filled properly.
`;
  const msgToLm: ChatMessage[] = [
    ...messages,
    {
      role: "user",
      message: responseSchemaMessage,
    },
  ];

  const result = await provider.chatComplete(msgToLm, options);
  if (!result) {
    logger.error("No result returned from language model. Please check the provider configuration.");
    return undefined;
  }
  const parsedResult = tryParseLanguageModelResult(result, responseZod);
  if (parsedResult === undefined) {
    logger.error("Failed to parse mapping result from LLM: " + result);
    return undefined;
  }

  if (parsedResult.type !== "error") {
    // Cache the result if it is a valid response
    lmCache.setForMsg(callerKey, messages, parsedResult);
  }

  return parsedResult;
}

export function createLmErrorResponse(errorMessage: string): LmErrorResponse {
  return {
    type: "error",
    error: errorMessage,
  };
}

export function tryParseLanguageModelResult<T>(
  text: string | undefined,
  responseZod: ZodType<T>,
): T | LmErrorResponse | undefined {
  if (!text) {
    logger.error("No text provided for parsing result");
    return undefined;
  }

  const jsonString = getJsonPart(text);

  const jsonObj = tryRepairAndParseJson(jsonString) as LmResponseBasic;
  if (!jsonObj || !jsonObj.type) {
    logger.error(`Invalid response from LM which is not a valid LmResponseBasic: ${text}`);
    return undefined;
  }
  if (jsonObj.type === "error") {
    const result = zLmErrorResponse.safeParse(jsonObj);
    if (result.success) {
      return result.data;
    } else {
      logger.error(`Invalid error response from LM: ${text}`);
      return undefined;
    }
  } else if (jsonObj.type === "content") {
    const result = responseZod.safeParse(jsonObj);
    if (result.success) {
      return result.data;
    } else {
      logger.error(`Invalid content response from LM: ${text}`);
      return undefined;
    }
  } else {
    logger.error(`Invalid response type: ${jsonObj.type}. Expected 'error' or 'content'. Response: ${text}`);
    return undefined;
  }
}

/** in case AI wrap the json with some text, try to have some simple handling for that */
function getJsonPart(text: string): string {
  // Find the first opening bracket/brace
  const openBracket = text.indexOf("[");
  const openBrace = text.indexOf("{");
  const startIndex = openBracket === -1 ? openBrace : openBrace === -1 ? openBracket : Math.min(openBracket, openBrace);

  if (startIndex === -1) {
    return text;
  }

  // Determine if we're looking for array or object based on which came first
  const isArray = text[startIndex] === "[";
  const closeChar = isArray ? "]" : "}";
  const endIndex = text.lastIndexOf(closeChar);

  if (endIndex === -1) {
    return text;
  }

  return text.substring(startIndex, endIndex + 1);
}
