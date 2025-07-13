import { LmProvider } from "@typespec/compiler/internals";
import { logger } from "../log/logger.js";
import { tryParseConnectionString } from "../utils.js";

export const ENV_VAR_LM_PROVIDER_CONNECTION_STRING = "LM_PROVIDER_CONNECTION_STRING";

/**
 *
 * @param connectionString we will read from environment variable LM_PROVIDER_CONNECTION_STRING if not provided
 * @returns
 */
export function getLmProvider(connectionString?: string | undefined): LmProvider | undefined {
  if (!connectionString) {
    connectionString = process.env[ENV_VAR_LM_PROVIDER_CONNECTION_STRING];
  }
  if (!connectionString) {
    logger.error(
      `Connection string is not provided or set in environment variable ${ENV_VAR_LM_PROVIDER_CONNECTION_STRING}`,
    );
    connectionString = "type=TspExLmProvider"; // default to TspExLmProvider with a default varKey
  }
  const csObj = tryParseConnectionString(connectionString);
  if (!csObj || !csObj.type) {
    logger.error("Invalid connection string: missing 'type' property");
    return undefined;
  }

  switch (csObj.type) {
    case "TspExLmProvider":
      return createTspExLmProvider({
        type: "TspExLmProvider",
      });
    // Add cases for other LmProvider types as needed
    default:
      logger.error(`Unsupported LmProvider type: ${csObj.type}`);
      return undefined;
  }
}

interface TspExLmProviderConnectionString {
  type: "TspExLmProvider";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createTspExLmProvider(csObject: TspExLmProviderConnectionString): LmProvider | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (globalThis as any).TspExLmProvider;
  if (!r || typeof r.chatComplete !== "function") {
    logger.error(`TspExLmProvider not found or does not implement chatComplete`);
    return undefined;
  }
  return r;
}
