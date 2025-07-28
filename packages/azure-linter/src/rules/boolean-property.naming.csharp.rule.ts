import { createRule, getDoc, getTypeName, paramMessage } from "@typespec/compiler";
import { inspect } from "util";
import { askLanguageModeWithRetry, reportLmErrors } from "../lm/lm-utils.js";
import { LmDiagnosticMessages, zRenameRespones } from "../lm/types.js";
import { logger } from "../log/logger.js";
import { createRenameCodeFix, getClientNameFromDec, isMyCode, splitNameByUpperCase } from "./rule-utils.js";

const ruleName = "csharp.naming.boolean-property-starts-with-verb";
export const booleanPropertyStartsWithVerbRule = createRule({
  name: ruleName,
  severity: "warning",
  description: "CSharp:Make sure boolean property's name starts with verb.",
  messages: {
    ...LmDiagnosticMessages,
    errorOccurs: paramMessage`CSharpNaming: Unexpected error occurs when checking boolean property '${"modelName"}.${"propName"}'. You may check console or VSCode TypeSpec Output logs for more details. Error: ${"error"}`,
    verbNeeded: paramMessage`CSharpNaming: Boolean property '${"modelName"}.${"propName"}' should start with a verb. ${"newNameSuggestions"}`,
  },
  create: (context) => {
    return {
      modelProperty: async (property) => {
        let propName = property.name;
        const propType = property.type;
        const modelName = property.model?.name ?? "No Model";

        // TODO: do we need to handle properties in ModelExpression?
        if (property.node === undefined || propType.kind !== "Scalar" || propType.name !== "boolean") {
          return; // Only check boolean properties
        }

        if (!isMyCode(property, context)) {
          return;
        }

        const docString = getDoc(context.program, property);
        const [n, csharpClientNameDec] = getClientNameFromDec(property, "csharp");
        if (n) {
          propName = n;
        }

        const propNameWords = splitNameByUpperCase(propName);
        if (propNameWords.length > 0) {
          const firstWord = propNameWords[0].toLowerCase();
          if (firstWord === "is" || firstWord === "can" || firstWord === "has" || firstWord === "use") {
            console.debug(
              `Skipping boolean property '${propName}' as it already starts with a common boolean verb: ${firstWord}`,
            );
            return;
          }
        }

        let docMsg = "";
        if (docString && docString.length > 0) {
          docMsg = `Detail description for the property '${propName}':\n${docString}`;
        }
        const message = `Check boolean property name '${propName}' which is in camel or pascal case, the name MUST start with a proper verb (i.e. 'Is', 'Has', 'Can', 'Use'...), otherwise suggest a few new name that starts with a verb (i.e. 'Is', 'Has', 'Can', 'Use'...) in pascal case.\n${docMsg}`;

        logger.debug(
          `Start calling askLanguageModeWithRetry for boolean property ${property.model?.name}.${propName} with message: ${message}`,
        );

        //const startTime = Date.now();
        //logger.warning(`start of ask lm for property: ${modelName}.${propName}\ncallstack: ${new Error().stack}`);
        const result = await askLanguageModeWithRetry(
          context,
          `${ruleName}.${getTypeName(property.model!)}.${propName}`,
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
        if (result.type !== "content") {
          reportLmErrors(result, property, context, (r) => {
            context.reportDiagnostic({
              target: property,
              messageId: "errorOccurs",
              format: {
                modelName,
                propName,
                error: `${inspect(r)}`,
              },
            });
          });
          return;
        } else {
          if (result.renameNeeded) {
            const suggestedNames = result.suggestedNames;
            context.reportDiagnostic({
              target: csharpClientNameDec?.args[0].node ?? property,
              messageId: "verbNeeded",
              format: {
                modelName,
                propName,
                newNameSuggestions:
                  suggestedNames.length > 0
                    ? `New name suggestions: ${suggestedNames.join(", ")}`
                    : "Please add a verb prefix to the property name.",
              },
              codefixes: createRenameCodeFix(result, csharpClientNameDec, context, property),
            });
          }
        }
      },
    };
  },
});
