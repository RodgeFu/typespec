import { defineLinter } from "@typespec/compiler";
import { csharpNamingRules } from "./rules/boolean-property.naming.csharp.rule.js";
import { noInterfaceRule } from "./rules/no-interfaces.rule.js";

export const $linter = defineLinter({
  rules: [noInterfaceRule, csharpNamingRules.booleanPropertyStartsWithVerbRule],
  ruleSets: {
    recommended: {
      enable: {
        [`azure-linter/${noInterfaceRule.name}`]: true,
        [`azure-linter/${csharpNamingRules.booleanPropertyStartsWithVerbRule.name}`]: true,
      },
    },
    all: {
      enable: {
        [`azure-linter/${noInterfaceRule.name}`]: true,
        [`azure-linter/${csharpNamingRules.booleanPropertyStartsWithVerbRule.name}`]: true,
      },
    },
  },
});
