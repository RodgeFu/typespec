import { defineLinter } from "@typespec/compiler";
import { tooGenericRule } from "./rules/avoid-too-generic-name.naming.csharp.rule.js";
import { booleanPropertyStartsWithVerbRule } from "./rules/boolean-property.naming.csharp.rule.js";
import { durationWithUnitRule } from "./rules/duration-with-unit.naming.csharp.rule.js";
import { noInterfaceRule } from "./rules/no-interfaces.rule.js";

export const $linter = defineLinter({
  rules: [noInterfaceRule, booleanPropertyStartsWithVerbRule, durationWithUnitRule, tooGenericRule],
  ruleSets: {
    recommended: {
      enable: {
        [`csharp-naming-linters/${noInterfaceRule.name}`]: true,
        [`csharp-naming-linters/${booleanPropertyStartsWithVerbRule.name}`]: true,
        [`csharp-naming-linters/${durationWithUnitRule.name}`]: true,
        [`csharp-naming-linters/${tooGenericRule.name}`]: true,
      },
    },
    all: {
      enable: {
        [`csharp-naming-linters/${noInterfaceRule.name}`]: true,
        [`csharp-naming-linters/${booleanPropertyStartsWithVerbRule.name}`]: true,
        [`csharp-naming-linters/${durationWithUnitRule.name}`]: true,
        [`csharp-naming-linters/${tooGenericRule.name}`]: true,
      },
    },
  },
});
