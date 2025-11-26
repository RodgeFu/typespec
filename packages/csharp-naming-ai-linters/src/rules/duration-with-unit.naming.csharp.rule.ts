import { getDoc, getTypeName, paramMessage } from "@typespec/compiler";
import { inspect } from "util";
import z from "zod";
import { LmRuleChecker } from "../lm/lm-rule-checker.js";
import { reportLmErrors } from "../lm/lm-utils.js";
import { defaultLmFamily, LmDiagnosticMessages, LmResponseError } from "../lm/types.js";
import { logger } from "../log/logger.js";
import {
  createRenameCodeFix,
  createRuleWithLmRuleChecker,
  getClientNameFromDec,
  isDirectPropertyOfModel,
  isIntegerType,
  isMyCode,
  isUnnamedModelProperty,
} from "./rule-utils.js";
import { RenameData } from "./types.js";

export const zDurationUnitRenameCheckResult = z.object({
  renameNeeded: z.boolean().describe("Indicates if the name needs to be changed. "),
  isTimeDurationOrIntervalOrPeriod: z
    .boolean()
    .describe("Indicates if the property is representing time duration, interval or period."),
  originalName: z
    .string()
    .describe("The exact original name given by user to check whether it needs to be changed."),
  suggestedNames: z
    .array(z.string())
    .describe(
      "An array of suggested names if it needs to be changed. The suggested names should meet the requirements provided by user and can describe itself well. The suggested names should be listed in a way that the first one is the most preferred name. Provide 3 suggestions at most. Double check you are not suggesting the original name as one of the suggestions.",
    ),
});
export type DurationUnitRenameCheckResult = z.infer<typeof zDurationUnitRenameCheckResult>;

const aiChecker = new LmRuleChecker(
  "duration-with-unit",
  [
    {
      role: "user",
      message: `Check the given property names which are in camel or pascal case. If the property is representing interval or duration or period of TIME (not timestamp), the name MUST contains unit information (i.e. MonitoringIntervalInSeconds, LatencyMs, DaysToWait, sessionExpirySeconds and so on). Otherwise the name needs to be renamed to contain unit information (i.e: should be MonitoringIntervalInSeconds instead of MonitoringInterval, TimeToLiveDurationInMilliseconds instead of TimeToLiveDuration, workPeriodInDays instead of workPeriod), in this case, suggest a new name with a proper unit suffix if you can determine the correct unit to use, otherwise DO NOT guess a unit suffix if you are not sure about the correct unit, just DON'T provide suggestions in that case. *IMPORTANT* this rule only apply to time interval or time duration or time period, NOT apply to other length that needs unit.`,
    },
  ],
  {
    modelPreferences: defaultLmFamily,
  },
  zDurationUnitRenameCheckResult,
);

const ruleName = "duration-with-unit";
export const durationWithUnitRule = createRuleWithLmRuleChecker(aiChecker, {
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
      modelProperty: (property) => {
        if (property.node === undefined || !isIntegerType(property.type, context.program)) {
          return;
        }
        if (
          !isMyCode(property, context) ||
          isUnnamedModelProperty(property) ||
          !isDirectPropertyOfModel(property)
        ) {
          return;
        }

        const docString = getDoc(context.program, property);
        const [n, clientNameDec] = getClientNameFromDec(property, "csharp");
        const modelname = property.model ? getTypeName(property.model) : "NoModel";
        const propName = n ?? property.name;
        const description = `property '${propName}' of model '${modelname}'${
          docString ? `, description: '${docString}'` : ""
        }`;

        let foundFromNormal = false;
        if (/Interval$|Duration$|Period$|Timeout$|Retention$|Ttl$/i.test(property.name)) {
          // logger.warning(
          //   `[Data]: property name without unit suffix found for - ${modelname}.${propName}`,
          // );
          foundFromNormal = true;
        }
        if (docString && /interval|duration|period|timeout|retention|ttl/i.test(docString)) {
          // logger.warning(
          //   `[Data]: property with duration/interval unit mentioned in docstring - ${modelname}.${propName}: ${docString}`,
          // );
          foundFromNormal = true;
        }
        let reportFromNormal = false;
        if (foundFromNormal) {
          if (
            /InSeconds$|InMilliseconds$|InMinutes$|InHours$|InDays$|InMonths$|InMs$|InSec$|Seconds$|Milliseconds$|Minutes$|Hours$|Days$|Months$|Ms$|Sec$/i.test(
              property.name,
            )
          ) {
            reportFromNormal = false;
          } else {
            reportFromNormal = true;
          }
        }

        const renameData: RenameData = {
          originalName: propName,
          description,
        };

        aiChecker.queueDataToCheck(
          renameData,
          (result) => {
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
              if (foundFromNormal && reportFromNormal) {
                logger.warning(
                  `[Data]: property name needing unit suffix found and reported from both - ${modelname}.${propName}`,
                );
                logger.warning(`[Data]: property doc - ${docString}`);
              } else {
                logger.warning(
                  `[Data]: property name needing unit suffix found and reported from AI only - ${modelname}.${propName}`,
                );
                logger.warning(`[Data]: property doc - ${docString}`);
              }
            } else {
              if (reportFromNormal) {
                logger.warning(
                  `[Data]: property name needing unit suffix found from normal only - ${modelname}.${propName}`,
                );
                logger.warning(`[Data]: property doc - ${docString}`);
              } else {
                if (foundFromNormal || result.isTimeDurationOrIntervalOrPeriod) {
                  logger.warning(
                    `[Data]: property name (interval) not need unit suffix found from both - ${modelname}.${propName}`,
                  );
                  logger.warning(`[Data]: property doc - ${docString}`);
                } else {
                  logger.warning(
                    `[Data]: property name (non-interval) not need unit suffix found from both - ${modelname}.${propName}`,
                  );
                  logger.warning(`[Data]: property doc - ${docString}`);
                }
              }
            }
          },
          (error) => {
            // TODO: handle other errors
            reportLmErrors(error as LmResponseError, property, context, (r) => {
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
          },
        );
      },
    };
  },
});
