import {
  createRule,
  DiagnosticTarget,
  getSourceLocation,
  getTypeName,
  Namespace,
  NoTarget,
  paramMessage,
} from "@typespec/compiler";
import {
  getFirstAncestor,
  IdentifierNode,
  MemberExpressionNode,
  SyntaxKind,
  TypeSpecScriptNode,
} from "@typespec/compiler/ast";
import { join } from "path";
import { inspect } from "util";
import z from "zod";
import { initLmCache } from "../lm/lm-cache.js";
import { ENV_VAR_LM_PROVIDER_CONNECTION_STRING, getLmProvider } from "../lm/lm-provider.js";
import { askLanguageModeWithRetry } from "../lm/lm-utils.js";
import { zLmResponseBasic } from "../lm/types.js";
import { logger } from "../log/logger.js";

const zRenameRespones = zLmResponseBasic.merge(
  z.object({
    type: z.literal("content"),
    renameNeeded: z
      .boolean()
      .describe(
        "Indicates if the boolean property name needs to be changed. If the name has already started with a verb and can describe the propery well, it will be false, else it will be true.",
      ),
    suggestedNames: z
      .array(z.string())
      .describe(
        "An array of suggested names for the boolean property if it needs to be changed. The suggested names must start with a verb like 'Is', 'Has', 'Can', etc. and can describe the property well. The suggested names should be listed in a way that the first one is the most preferred name. Provide 3 suggestions at most.",
      ),
  }),
);

const booleanPropertyStartsWithVerbRule = createRule({
  name: "csharp.naming.boolean-property-starts-with-verb",
  severity: "warning",
  description: "CSharp:Make sure boolean property's name starts with verb.",
  messages: {
    lmProviderNotAvailable: `Language Model is not available. If you are in VSCode, please make sure TypeSpec extension has been installed and VSCode LM has been initialized which may take some time if you just start the VSCode. If you are outside of VSCode, please make sure the environment variable ${ENV_VAR_LM_PROVIDER_CONNECTION_STRING} is set properly.`,
    errorOccurs: paramMessage`CSharpNaming: Unexpected error occurs when checking boolean property '${"modelName"}.${"propName"}'. You may check console or VSCode TypeSpec Output logs for more details. Error: ${"error"}`,
    noLmResponse: paramMessage`CSharpNaming: No response from Language Model when checking boolean property '${"modelName"}.${"propName"}', please check whether the language model is available and retry again.`,
    renameWithoutSuggestions: paramMessage`CSharpNaming: Boolean property '${"modelName"}.${"propName"}' should start with a verb, but no suggestions were provided by languange model.`,
    renameNeeded: paramMessage`CSharpNaming: Boolean property '${"modelName"}.${"propName"}' should start with a verb. Suggested names: ${"suggestedNames"}`,
  },
  create: (context) => {
    const path = join(context.program.projectRoot, "azure-linter-lm.cache");
    initLmCache(path);

    const lmProvider = getLmProvider();
    let lmProviderNotAvailableReported = false;
    const reportLmProviderNotAvailableError = (target: DiagnosticTarget | typeof NoTarget) => {
      if (!lmProviderNotAvailableReported) {
        context.reportDiagnostic({
          target,
          messageId: "lmProviderNotAvailable",
        });
        lmProviderNotAvailableReported = true;
      }
    };
    return {
      modelProperty: async (property) => {
        let propName = property.name;
        const propType = property.type;
        const modelName = property.model?.name ?? "No Model";

        // TODO: do we need to handle properties in ModelExpression?
        if (property.node === undefined || propType.kind !== "Scalar" || propType.name !== "boolean") {
          return; // Only check boolean properties
        }

        const srcFile = getSourceLocation(property.node);
        const tspFileContext = context.program.getSourceFileLocationContext(srcFile.file);
        // Do we still need to worry about node_modules?
        if (tspFileContext.type !== "project" || srcFile.file.path.includes("node_modules")) {
          return;
        }

        const docArray: string[] = [];
        for (const doc of property.node.docs ?? []) {
          docArray.push(...doc.content.map((c) => c.text));
        }

        let csharpClientNameDec = undefined;
        for (const dec of property.decorators) {
          if (!dec.definition) {
            continue;
          }
          const decName = dec.definition.name;
          const getFullNamespace = (ns: Namespace | undefined): string => {
            if (!ns || !ns.name) {
              return "";
            } else {
              const prefix = getFullNamespace(ns.namespace);
              return prefix ? `${prefix}.${ns.name}` : ns.name;
            }
          };
          const decNamespace = getFullNamespace(dec.definition.namespace);
          const getStringArgValue = (argIndex: number): string | undefined => {
            if (dec.args.length <= argIndex) {
              return undefined;
            }
            const arg = dec.args[argIndex].value;
            if (arg.entityKind === "Value" && arg.valueKind === "StringValue") {
              return arg.value;
            } else {
              return undefined;
            }
          };
          if (decName === "@doc" && decNamespace === "TypeSpec") {
            const docValue = getStringArgValue(0);
            if (docValue) {
              docArray.push(docValue);
            }
          } else if (decName === "@clientName" && decNamespace === "Azure.ClientGenerator.Core") {
            const newName = getStringArgValue(0);
            const language = getStringArgValue(1);
            if (newName && language === "csharp") {
              csharpClientNameDec = dec;
              propName = newName;
            }
          }
        }

        // Shortcut for property name already starts with common boolean verbs
        const propNameWords = propName.split(/(?=[A-Z])/).filter((word) => word.length > 0);
        if (propNameWords.length > 0) {
          const firstWord = propNameWords[0].toLowerCase();
          if (firstWord === "is" || firstWord === "can" || firstWord === "has" || firstWord === "use") {
            console.debug(
              `Skipping boolean property '${propName}' as it already starts with a common boolean verb: ${firstWord}`,
            );
            return;
          }
        }

        // if (!lmProvider) {
        //   reportLmProviderNotAvailableError(property);
        //   return;
        // }

        let docMsg = "";
        if (docArray.length > 0) {
          docMsg = `Detail description for the property '${propName}':\n${docArray.join("\n")}`;
        }
        const message = `Check boolean property name '${propName}' which is in camel or pascal case, the name MUST start with a proper verb (i.e. 'Is', 'Has', 'Can', 'Use'...), otherwise suggest a few new name that starts with a verb (i.e. 'Is', 'Has', 'Can', 'Use'...) in pascal case.\n${docMsg}`;

        logger.debug(
          `Start calling askLanguageModeWithRetry for boolean property ${property.model?.name}.${propName} with message: ${message}`,
        );

        try {
          //const startTime = Date.now();
          //logger.warning(`start of ask lm for property: ${modelName}.${propName}\ncallstack: ${new Error().stack}`);
          const result = await askLanguageModeWithRetry(
            lmProvider,
            `csharp.naming.boolean-property-starts-with-verb.${getTypeName(property.model!)}.${propName}`,
            [
              {
                role: "user",
                message,
              },
            ],
            {
              modelPreferences: ["gpt-4o"],
            },
            zRenameRespones,
            2, // retry count
          );
          //logger.warning("end of ask lm, duration: " + (Date.now() - startTime) + " ms");
          if (!result) {
            context.reportDiagnostic({
              target: property,
              messageId: "noLmResponse",
              format: {
                modelName,
                propName,
              },
            });
            return;
          } else if (result.type === "error") {
            if (result.error === "Language model provider is not available") {
              reportLmProviderNotAvailableError(property);
              return;
            }
            context.reportDiagnostic({
              target: property,
              messageId: "errorOccurs",
              format: {
                modelName,
                propName,
                error: result.error,
              },
            });
            return;
          } else if (result.type !== "content") {
            context.reportDiagnostic({
              target: property,
              messageId: "errorOccurs",
              format: {
                modelName,
                propName,
                error: `${inspect(result)}`,
              },
            });
            return;
          } else {
            if (result.renameNeeded) {
              const suggestedNames = result.suggestedNames;
              if (suggestedNames && suggestedNames.length > 0) {
                context.reportDiagnostic({
                  target: csharpClientNameDec?.args[0].node ?? property,
                  messageId: "renameNeeded",
                  format: {
                    modelName,
                    propName,
                    suggestedNames: suggestedNames.join(", "),
                  },
                  codefixes: suggestedNames.map((newName) => {
                    return {
                      id: "csharp:rename-boolean-property",
                      // TODO: add delay between retry
                      // TODO: give cache a ttl in case the last response is not valid...
                      label: `CSharp: Rename to "${newName}" by adding @@clientName to 'client.tsp' file`,
                      fix: (p) => {
                        if (!csharpClientNameDec) {
                          //const location = getSourceLocation(property.node!);
                          //const pos2 = location.file.getLineAndCharacterOfPosition(location.pos);
                          //const indent = " ".repeat(pos2.character);
                          const scriptNode = getFirstAncestor(
                            property.node!,
                            (n) => n.kind === SyntaxKind.TypeSpecScript,
                          ) as TypeSpecScriptNode | undefined;
                          let clientNameDecName = "@Azure.ClientGenerator.Core.clientName";
                          const getFullUsingName = (member: MemberExpressionNode | IdentifierNode): string => {
                            if (member.kind === SyntaxKind.Identifier) {
                              return member.sv;
                            } else {
                              if (member.base === undefined) {
                                return member.id.sv;
                              } else {
                                return `${getFullUsingName(member.base)}.${member.id.sv}`;
                              }
                            }
                          };
                          if (scriptNode !== undefined) {
                            for (const u of scriptNode.usings) {
                              const fullUsingName = getFullUsingName(u.name);
                              if (fullUsingName === "Azure.ClientGenerator.Core") {
                                clientNameDecName = "@clientName";
                                break;
                              }
                            }
                          }

                          let fix;
                          context.program.sourceFiles.forEach((v, k) => {
                            // we should do more check than just naming
                            if (k.endsWith("client.tsp")) {
                              const mn = getTypeName(property.model!);
                              const p = v.file.text.length;
                              fix = {
                                kind: "insert-text",
                                text: `\n@${clientNameDecName}(${mn}.${property.name}, "${newName}", "csharp");`,
                                pos: p,
                                file: v.file,
                              };
                            }
                          });
                          return fix;

                          //return p.prependText(location, `${clientNameDecName}("${newName}", "csharp")\n${indent}`);
                        } else {
                          const location = getSourceLocation(csharpClientNameDec.args[0].node!);
                          return p.replaceText(location, `"${newName}"`);
                        }
                      },
                    };
                  }),
                });
              } else {
                context.reportDiagnostic({
                  target: property,
                  messageId: "renameWithoutSuggestions",
                  format: {
                    modelName,
                    propName,
                  },
                });
              }
            }
          }
        } catch (error) {
          context.reportDiagnostic({
            target: property,
            messageId: "errorOccurs",
            format: {
              modelName,
              propName,
              error: error instanceof Error ? error.message : inspect(error),
            },
          });
        }
      },
    };
  },
});

export const csharpNamingRules = {
  booleanPropertyStartsWithVerbRule,
};
