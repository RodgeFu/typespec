# TypeSpec Language Summary

## TypeSpec Language Syntax Summary

| Feature               | Description                                                               | Examples                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Declarations          | Unique names within the same scope.                                       | `model Pet {}`<br>`scalar Password extends string;`<br>`enum Direction {}`                                                            |
| Imports               | Import other TypeSpec files or modules.                                   | `import "./models/foo.tsp";`<br>`import "./decorators.js";`<br>`import "@typespec/rest";`                                             |
| Namespaces            | Define a scope for models and other declarations.                         | `namespace PetStore.Models { model Pet {} }`<br>`using PetStore.Models;`                                                              |
| Scalars               | Define custom scalar types.                                               | `scalar Password extends string;`<br>`scalar ipv4 extends string { init fromInt(value: uint32); }`                                    |
| Models                | Define data structures with properties.                                   | `model Dog { name: string; age?: int32 = 0; }`<br>`model Cat extends Pet { furColor: string; }`<br>`model Dog { ...Animal; ...Pet; }` |
| Aliases               | Create type aliases for reuse.                                            | `alias Options = "one"                                                                                                                | "two";`<br>`alias PetName = Pet.name;`<br>`alias StringArray = string[];`             |
| Enums                 | Define enumerated types with named values.                                | `enum Direction { North: "north", East: "east" }`<br>`enum ExtendedDirection { ...Direction, South: "south" }`                        |
| Unions                | Define a type that can be one of several types.                           | `union Pet { cat: Cat, dog: Dog }`<br>`union Breed { beagle: Beagle, shepherd: GermanShepherd }`                                      |
| Intersections         | Combine multiple types into one.                                          | `alias Dog = Animal & Pet;`<br>`alias UKAddress = Address<never>;`                                                                    |
| Arrays and Records    | Define array and record types.                                            | `alias StringArray = string[];`<br>`alias StringRecord = Record<string>;`                                                             |
| Interfaces            | Define contracts for models with operations.                              | `interface PetStore { listPets(): Pet[]; }`<br>`interface ExtendedStore extends PetStore { addPet(pet: Pet): void; }`                 |
| Operations            | Define functions or methods with input and output types.                  | `op getPet(name: string): Pet                                                                                                         | Error;`<br>`op deletePet is DeleteOperation;`<br>`op ReadResource<T>(id: string): T;` |
| Templates             | Define generic models and aliases with type parameters.                   | `model Page<Item> { size: number; items: Item[]; }`<br>`alias Foo<Type extends string = "default"> = Type;`                           |
| Values                | Define constants and literals.                                            | `const point = #{ x: 0, y: 0 };`<br>`const tags = #["TypeSpec", "JSON"];`<br>`const ip = ipv4.fromInt(2130706433);`                   |
| Comments              | Single-line, multi-line, and documentation comments.                      | `// Single-line comment`<br>`/* Multi-line comment */`<br>`/** Doc comment */`                                                        |
| Built-in Types        | Numeric (`int32`, `float64`, `decimal`), String, Boolean, Null.           | `int32`<br>`"example"`<br>`true`<br>`null`                                                                                            |
| Decorators            | Add metadata to models, properties, and operations.                       | `@doc("This is a pet model") model Pet { name: string; }`<br>`@@visibility(Dog.name, Lifecycle.Read);`                                |
| Layout and Formatting | 2-space indentation, space before curly brace, newline after blocks, etc. | `model Pet { name: string; }`<br>`op list(filter: string): Pet[];`                                                                    |

## Style Guide Summary

| Type               | Naming                                       | Example                                          |
| ------------------ | -------------------------------------------- | ------------------------------------------------ |
| scalar             | camelCase                                    | `scalar uuid extends string;`                    |
| model              | PascalCase                                   | `model Pet {}`                                   |
| model property     | camelCase                                    | `model Pet {furColor: string}`                   |
| enum               | PascalCase                                   | `enum Direction {}`                              |
| enum member        | camelCase                                    | `enum Direction {up, down}`                      |
| namespace          | PascalCase                                   | `namespace Org.PetStore`                         |
| interface          | PascalCase                                   | `interface Stores {}`                            |
| operation          | camelCase                                    | `op listPets(): Pet[];`                          |
| operation params   | camelCase                                    | `op getPet(petId: string): Pet;`                 |
| unions             | PascalCase                                   | `union Pet {cat: Cat, dog: Dog}`                 |
| unions variants    | camelCase                                    | `union Pet {cat: Cat, dog: Dog}`                 |
| alias              | camelCase or PascalCase depending on context | `alias myString = string` or `alias MyPet = Pet` |
| decorators         | camelCase                                    | `@format`, `@resourceCollection`                 |
| functions          | camelCase                                    | `addedAfter`                                     |
| file name          | kebab-case                                   | `my-lib.tsp`                                     |
| template parameter | PascalCase                                   | `<ExampleParameter>`                             |

## Layout and Formatting

- 2-space indentation
- Space before opening curly brace
- Curly brace `{` on same line
- Newline after blocks
- No spaces inside parentheses
- Spaces inside curly braces `{ }`
- No spaces inside square brackets `[]`
- Comments start with a space
- Avoid trailing spaces

## Emitters to generate different code from typespec

| Code to generate | Package to use               |
| ---------------- | ---------------------------- |
| java             | @typespec/http-client-java   |
| c#               | @typespec/http-client-csharp |
| javascript       | @typespec/http-client-js     |
| python           | @typespec/http-client-python |

This document summarizes TypeSpec syntax and style conventions concisely for quick reference and AI processing.
