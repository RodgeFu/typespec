import { defineLinter } from "@typespec/compiler";
import { booleanPropertyStartsWithVerbRule } from "./rules/boolean-property.naming.csharp.rule.js";
import { durationWithUnitRule } from "./rules/duration-with-unit.naming.csharp.rule.js";
import { noInterfaceRule } from "./rules/no-interfaces.rule.js";

export const $linter = defineLinter({
  rules: [noInterfaceRule, booleanPropertyStartsWithVerbRule, durationWithUnitRule],
  ruleSets: {
    recommended: {
      enable: {
        [`azure-linter/${noInterfaceRule.name}`]: true,
        [`azure-linter/${booleanPropertyStartsWithVerbRule.name}`]: true,
        [`azure-linter/${durationWithUnitRule.name}`]: true,
      },
    },
    all: {
      enable: {
        [`azure-linter/${noInterfaceRule.name}`]: true,
        [`azure-linter/${booleanPropertyStartsWithVerbRule.name}`]: true,
        [`azure-linter/${durationWithUnitRule.name}`]: true,
      },
    },
  },
});
