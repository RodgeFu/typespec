import { createRule, getDoc, getTypeName, paramMessage } from "@typespec/compiler";
import { inspect } from "util";
import { askLanguageModeWithRetry, reportLmErrors } from "../lm/lm-utils.js";
import { LmDiagnosticMessages, zRenameRespones } from "../lm/types.js";
import { createRenameCodeFix, getClientNameFromDec, isMyCode } from "./rule-utils.js";

const ruleName = "csharp.naming.duration-with-unit";
export const durationWithUnitRule = createRule({
  name: ruleName,
  severity: "warning",
  description:
    "DO End property or parameter names of type integer that represent intervals or durations with units, for example: MonitoringInterval -> MonitoringIntervalInSeconds.",
  messages: {
    ...LmDiagnosticMessages,
    errorOccurs: paramMessage`CSharpNaming: Unexpected error occurs when checking internals or durations unit for property '${"modelName"}.${"propName"}'. You may check console or VSCode TypeSpec Output logs for more details. Error: ${"error"}`,
    unitNeeded: paramMessage`CSharpNaming: Property '${"modelName"}.${"propName"}' is for intervals or durations, but does not have a unit suffix. ${"newNameSuggestions"}`,
  },
  create: (context) => {
    return {
      modelProperty: async (property) => {
        if (
          property.node == undefined ||
          property.type.kind !== "Scalar" ||
          // TODO: double check and confirm the full list
          ["numeric", "integer", "int64", "int32", "int16", "int8", "uint64", "uint32", "uint16", "uint8"].includes(
            property.type.name,
          ) === false
        ) {
          return;
        }
        if (!isMyCode(property, context)) {
          return;
        }
        const docString = getDoc(context.program, property);
        const [n, clientNameDec] = getClientNameFromDec(property, "csharp");
        const propName = n ?? property.name;

        const message = `Check the property name '${propName}' below which is in camel or pascal case. If the property is for internvals or durations, it MUST ends with a unit suffix in format '...In<Unit>' (i.e: should be MonitoringIntervalInSeconds instead of MonitoringInterval, TimeToLiveDurationInMilliseconds instead of TimeToLiveDuration), otherwise suggest a new name with a proper suffix if you can determine the correct unit to use, otherwise DO NOT guess a unit suffix if you are not sure about the correct unit, just DON'T provide suggestions in that case.\n
property name: ${propName}
property description: ${docString ?? "No description provided"}`;

        const result = await askLanguageModeWithRetry(
          context,
          `${ruleName}.${getTypeName(property.model!)}.${propName}`,
          [
            {
              role: "user",
              message,
            },
          ],
          {},
          zRenameRespones,
          2 /*retry count*/,
        );
        if (result.type === "error") {
          reportLmErrors(result, property, context, (r) => {
            context.reportDiagnostic({
              target: property,
              messageId: "errorOccurs",
              format: {
                modelName: property.model?.name ?? "unknown",
                propName: property.name,
                error: `${inspect(r)}`,
              },
            });
          });
          return;
        } else {
          if (result.renameNeeded) {
            const suggestedNames = result.suggestedNames;
            context.reportDiagnostic({
              target: property,
              messageId: "unitNeeded",
              format: {
                modelName: property.model?.name ?? "unknown",
                propName: property.name,
                newNameSuggestions:
                  suggestedNames.length > 0
                    ? `New name suggestions: ${suggestedNames.join(", ")}`
                    : "Please append a unit suffix to the property name.",
              },
              codefixes: createRenameCodeFix(result, clientNameDec, context, property),
            });
          }
        }
      },
    };
  },
});
