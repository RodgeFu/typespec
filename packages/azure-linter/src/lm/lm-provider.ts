import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import { ChatCompleteOptions, ChatMessage, LmProvider } from "@typespec/compiler/internals";
import { AzureOpenAI } from "openai";
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
    case "AiFoundryLmProvider":
      if (
        !csObj.serviceType ||
        csObj.serviceType !== "openai" ||
        !csObj.endpoint ||
        !csObj.apiVersion ||
        !csObj.deployment
      ) {
        logger.error(
          "Invalid AiFoundryLmProvider connection string: missing 'serviceType', 'endpoint', 'apiVersion', or 'deployment' property",
        );
        return undefined;
      }
      return createAiFoundryLmProvider({
        type: "AiFoundryLmProvider",
        serviceType: csObj.serviceType,
        endpoint: csObj.endpoint,
        apiVersion: csObj.apiVersion,
        deployment: csObj.deployment,
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
    logger.warning(`Default TspExLmProvider not found`);
    return undefined;
  }
  return r;
}

interface AiFoundryLmProviderConnectionString {
  type: "AiFoundryLmProvider";
  // only support open ai service for now
  serviceType: "openai";
  endpoint: string;
  apiVersion: string;
  // model deployment name
  deployment: string;
}

function createAiFoundryLmProvider(csObject: AiFoundryLmProviderConnectionString): LmProvider | undefined {
  // Set following for testing:
  // LM_PROVIDER_CONNECTION_STRING=endpoint=https://llawfuncapp-openai-8ac0.openai.azure.com;apiVersion=2024-08-01-preview;deployment=gpt-4o;type=AiFoundryLmProvider;serviceType=openai
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    chatComplete: async (messages: ChatMessage[], options: ChatCompleteOptions): Promise<string> => {
      // Initialize the DefaultAzureCredential
      const credential = new DefaultAzureCredential();
      const scope = "https://cognitiveservices.azure.com/.default";
      const azureADTokenProvider = getBearerTokenProvider(credential, scope);

      // Initialize the AzureOpenAI client with Entra ID (Azure AD) authentication
      const client = new AzureOpenAI({
        endpoint: csObject.endpoint,
        azureADTokenProvider,
        apiVersion: csObject.apiVersion,
        deployment: csObject.deployment,
      });

      const result = await client.chat.completions.create({
        messages: messages.map((m) => {
          if (m.role === "user") {
            return { role: "user", content: m.message };
          } else if (m.role === "assist") {
            return { role: "assistant", content: m.message };
          } else {
            logger.error(`Unsupported message role: ${m.role}, default to 'user' role`);
            return { role: "user", content: m.message };
          }
        }),
        // shall we use the options's model? or it's defined by the deployment already? needs to double check
        model: "gpt-4o",
      });

      // take the first choice and return the content to keep things simple
      if (!result.choices || result.choices.length === 0) {
        logger.error("No choices returned from the chat completion.");
        return "";
      }
      if (!result.choices[0].message || !result.choices[0].message.content) {
        logger.error("No content in the first choice's message.");
        return "";
      }
      // Log the content of the first choice's message
      logger.info("Chat completion result:", result.choices[0].message.content);
      // Return the content as a string
      return result.choices[0].message.content;
    },
  };
}
