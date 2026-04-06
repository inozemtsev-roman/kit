# TypeScript to Swift Code Generation System

## Overview

The code generation pipeline converts TypeScript type definitions to Swift models through a multi-stage process:

```
TypeScript Models → JSON Schema → OpenAPI 3.0 → Swift Code
     (kit)        (ts-json-schema-generator)    (openapi-generator)
```

**Two repositories are involved:**
- **kit** (`/Volumes/Neverland/Development/iOS/ton/kit`) — TypeScript models + JSON Schema/OpenAPI generation
- **kit-ios** (`/Volumes/Neverland/Development/iOS/walletkit-ios/kit-ios`) — Swift code generation from OpenAPI

## Key Files

### kit (TypeScript → JSON Schema → OpenAPI)

| File | Purpose |
|------|---------|
| `packages/walletkit/src/api/models/` | TypeScript model definitions |
| `packages/walletkit/src/api/models/index.ts` | Export barrel — types must be exported here to be included |
| `packages/walletkit/src/api/scripts/generate-json-schema.js` | Custom JSON Schema generator with vendor extensions |
| `packages/walletkit/src/api/scripts/generate-openapi-spec.sh` | Shell script orchestrating the generation |
| `packages/walletkit/src/api/scripts/json-schema-to-openapi-spec.js` | Converts JSON Schema to OpenAPI 3.0 format |
| `packages/walletkit/src/api/scripts/generated/temp-schema.json` | Intermediate JSON Schema output (for debugging) |
| `packages/walletkit/src/api/scripts/generated/walletkit-openapi.json` | Final OpenAPI spec consumed by kit-ios |

### kit-ios (OpenAPI → Swift)

| File | Purpose |
|------|---------|
| `kit-ios/Scripts/generate-api/generate-api-models.sh` | Main generation script |
| `kit-ios/Scripts/generate-api/templates/model.mustache` | Main template — dispatches to sub-templates based on vendor extensions |
| `kit-ios/Scripts/generate-api/templates/modelObject.mustache` | Struct template (frozen, constant, inline union fields) |
| `kit-ios/Scripts/generate-api/templates/modelGeneric.mustache` | Generic struct template |
| `kit-ios/Scripts/generate-api/templates/modelAllOf.mustache` | Dispatches to modelObject or discriminated enum |
| `kit-ios/Scripts/generate-api/templates/modelDiscriminatedEnum.mustache` | Discriminated union enum template (interface and inline object variants) |
| `kit-ios/Scripts/generate-api/templates/modelEnum.mustache` | Simple enum template |
| `kit-ios/Scripts/generate-api/templates/modelOneOf.mustache` | oneOf union template |

Generated Swift output: `kit-ios/Sources/TONWalletKit/API/Models/WalletKit/`

---

## Data Flow: Concrete Example

### Input TypeScript
```typescript
/** @discriminator type */
export type SignatureDomain = SignatureDomainL2 | SignatureDomainEmpty;

export type SignatureDomainL2 = { type: 'l2'; /** @format int */ globalId: number; };
export type SignatureDomainEmpty = { type: 'empty'; };
```

### Stage 1: JSON Schema (after generate-json-schema.js)

ts-json-schema-generator produces an `allOf` with `if/then` entries. Then `postProcessDiscriminatedUnions()` transforms it to:

```json
{
  "SignatureDomain": {
    "type": "object",
    "properties": {
      "x_l2": {
        "allOf": [{"$ref": "#/definitions/SignatureDomainL2"}],
        "x-enum-case-name": "l2",
        "x-enum-case-raw-value": "l2"
      },
      "x_empty": {
        "allOf": [{"$ref": "#/definitions/SignatureDomainEmpty"}],
        "x-enum-case-name": "empty",
        "x-enum-case-raw-value": "empty",
        "x-empty-variant": true
      }
    },
    "x-discriminated-union": true,
    "x-interface-union": true,
    "x-discriminator-field": "type"
  },
  "SignatureDomainL2": {
    "type": "object",
    "properties": { "globalId": {"type": "integer", "format": "int"} },
    "required": ["globalId"],
    "x-constant-fields": [{"name": "type", "value": "l2", "type": "String"}]
  },
  "SignatureDomainEmpty": {
    "type": "object",
    "properties": {},
    "x-constant-fields": [{"name": "type", "value": "empty", "type": "String"}]
  }
}
```

### Stage 2: OpenAPI 3.0 (after json-schema-to-openapi-spec.js)

Refs change from `#/definitions/` to `#/components/schemas/`. Vendor extensions pass through unchanged.

### Stage 3: Swift (after openapi-generator with mustache templates)

```swift
public enum TONSignatureDomain: Codable {
    case l2(TONSignatureDomainL2)
    case empty  // empty variant — no associated value

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let discriminator = try container.decode(String.self, forKey: .discriminator)
        switch discriminator {
        case "l2": self = .l2(try TONSignatureDomainL2(from: decoder))
        case "empty": self = .empty
        default: throw DecodingError.dataCorruptedError(...)
        }
    }
    // ...
}

public struct TONSignatureDomainL2: Codable {
    public var globalId: Int
    public let type: String  // constant = "l2", NOT in init
}
```

### Const-Object Enum Example

#### Input TypeScript
```typescript
export const SETTLEMENT_METHOD_SWAP = 'SETTLEMENT_METHOD_SWAP';
export const SETTLEMENT_METHOD_ESCROW = 'SETTLEMENT_METHOD_ESCROW';

export const SettlementMethod = {
    SETTLEMENT_METHOD_SWAP: SETTLEMENT_METHOD_SWAP,
    SETTLEMENT_METHOD_ESCROW: SETTLEMENT_METHOD_ESCROW,
} as const;

export type SettlementMethodValue = (typeof SettlementMethod)[keyof typeof SettlementMethod];
```

#### JSON Schema (after generate-json-schema.js + post-processing)
`ConstEnumNodeParser` detects the `(typeof X)[keyof typeof X]` pattern, extracts enum values from the const object, and emits `x-definition-name: "SettlementMethod"`. `postProcessDefinitionNames()` renames the definition from `SettlementMethodValue` to `SettlementMethod` and updates all `$ref`s.

```json
{
  "SettlementMethod": {
    "type": "string",
    "enum": ["SETTLEMENT_METHOD_SWAP", "SETTLEMENT_METHOD_ESCROW"],
    "x-enum-varnames": ["swap", "escrow"]
  }
}
```

Varname derivation: const name `SettlementMethod` → `SETTLEMENT_METHOD_` prefix → strip from each key → camelCase remainder.

#### Generated Swift
```swift
public enum TONSettlementMethod: String, Codable, CaseIterable {
    case swap = "SETTLEMENT_METHOD_SWAP"
    case escrow = "SETTLEMENT_METHOD_ESCROW"
}

extension TONSettlementMethod: JSValueCodable {}
```

---

## OpenAPI Vendor Extensions Reference

| Extension | Where | Purpose | Example |
|-----------|-------|---------|---------|
| `x-is-generic` | type def | Template dispatch for generics | `true` |
| `x-generic-params` | type def | Type parameter names | `[{name: "T"}]` |
| `x-generic-type-ref` | property | Property uses a generic type parameter | `"T"` |
| `x-discriminated-union` | type def | Marks discriminated union types | `true` |
| `x-interface-union` | type def or property | Interface-based union (vs inline object) | `true` |
| `x-discriminator-field` | type def | JSON field name used as discriminator | `"type"` |
| `x-empty-variant` | case property | Union case with no associated value (member has only discriminator field) | `true` |
| `x-enum-cases` | type def | Case info for inline object unions | `[{name, rawValue, hasAssociatedValue}]` |
| `x-enum-case-name` | case property | camelCase Swift case name | `"testWithMessage"` |
| `x-enum-case-raw-value` | case property | Original JSON discriminator value | `"testWithMessage"` |
| `x-enum-varnames` | enum def | Enum member names in camelCase | `["case1", "case2"]` |
| `x-constant-fields` | type def | Constant fields (single-literal values) | `[{name, value, type}]` |
| `x-frozen` | property | Opaque field → `AnyCodable` with `private let` | `true` |
| `x-inline-interface-unions` | type def | Inline union data for nested enum rendering | `[{propertyName, discriminatorField, cases}]` |
| `x-definition-name` | enum def | Renames the definition in post-processing (used by `ConstEnumNodeParser` when the const object name differs from the type alias name) | `"SettlementMethod"` |
| `x-type-alias` | type def | Marks definition as a pure type alias | `true` |
| `x-alias-target` | type def | Target type name for alias (without prefix) | `"OmnistonReferrerOptions"` |

---

## Mustache Template Dispatch

```
model.mustache checks in order:
  x-type-alias?          → public typealias (inline in model.mustache)
    x-discriminated-union? → modelDiscriminatedEnum.mustache
      x-is-generic?        → modelGeneric.mustache
      x-is-one-of?       → modelOneOf.mustache
        isArray?          → modelArray
          isEnum?         → modelEnum.mustache
            else          → modelAllOf.mustache → modelObject.mustache
```

### modelDiscriminatedEnum.mustache — Two Variants

1. **Interface unions** (`x-interface-union: true`):
   - Each case property has `x-enum-case-name`, `x-enum-case-raw-value`, and optionally `x-empty-variant`
   - Decodes full struct from decoder: `try Type(from: decoder)`
   - Empty variants: `case name` (no associated value), encode discriminator directly
   - Non-empty variants: `case name(Type)`, delegate encode to struct

2. **Inline object unions** (`x-interface-union` absent):
   - Uses `x-enum-cases` with `hasAssociatedValue` boolean
   - CodingKeys: `type` and `value`
   - Decodes from container: `container.decode(Type.self, forKey: .value)`

### modelObject.mustache Key Sections

1. **Inline interface union enums** (`x-inline-interface-unions`): Nested enum declarations with `emptyVariant` support
2. **Property declarations**: `x-frozen` → AnyCodable, `x-interface-union` → nested enum type, regular types
3. **Constant fields** (`x-constant-fields`): `public let name: String`, excluded from `init` parameters, set in body
4. **CodingKeys**: Includes both constant and regular fields
5. **Encode**: Encodes constant fields alongside regular fields

---

## Processing Pipeline in generate-json-schema.js

### Custom Node Parsers (registered with higher priority than defaults)

| Parser | Detects | Creates |
|--------|---------|---------|
| `ConstEnumNodeParser` | `type X = (typeof Obj)[keyof typeof Obj]` const-object pattern | `EnumTypeWithNames` with `x-definition-name` annotation |
| `EnumNodeParserWithNames` | TypeScript enums | `EnumTypeWithNames` with member names |
| `DiscriminatedUnionNodeParser` | `{ type: 'literal', value?: ... }` unions | `DiscriminatedUnionType` + `SyntheticValueType` |
| `GenericInterfaceNodeParser` | `interface Foo<T> { ... }` | `GenericInterfaceType` |

### Custom Type Formatters

| Formatter | Handles | Outputs |
|-----------|---------|---------|
| `OpenAPIDefinitionTypeFormatter` | Definition types | `$ref: "#/components/schemas/..."` |
| `OpenAPIReferenceTypeFormatter` | Recursive type references | `$ref` for circular types |
| `AnnotatedTypeFormatterWithIntegers` | `@format int`, `@format frozen` | `integer` type or `x-frozen` |
| `EnumTypeFormatterWithVarnames` | `EnumTypeWithNames` | `x-enum-varnames` |
| `SyntheticValueTypeFormatter` | `SyntheticValueType` | Associated value schemas |
| `DiscriminatedUnionTypeFormatter` | `DiscriminatedUnionType` | `x-discriminated-union`, `x-enum-cases` |
| `GenericInterfaceTypeFormatter` | `GenericInterfaceType` | `x-is-generic`, `x-generic-params` |
| `GenericPropertiesObjectTypeFormatter` | Properties with generics | `x-generic-type-ref` |

### Post-processing Functions (run after schema generation)

| Function | Purpose |
|----------|---------|
| `postProcessDefinitionNames()` | Renames definitions that have `x-definition-name` and updates all `$ref`s. Runs first so subsequent post-processors see the final names. |
| `postProcessDiscriminatedUnions()` | Transforms `@discriminator` annotated unions → `x-discriminated-union` + `x-interface-union` schema. Removes discriminator from members → `x-constant-fields`. Detects empty variants → `x-empty-variant`. |
| `postProcessConstantFields()` | Converts standalone single-literal properties (`const` or 1-element `enum`) → `x-constant-fields` |
| `postProcessStripDefaults()` | Removes `@default` annotations (documentation-only, not for codegen) |
| `postProcessTypeAliases()` | Converts pure `$ref` definitions (TS type aliases like `type A = B`) → `x-type-alias` + `x-alias-target`. Adds dummy property so openapi-generator processes the schema. |

### Helper Functions

| Function | Purpose |
|----------|---------|
| `detectDiscriminatedUnion(schemaDef)` | Detects `allOf` with `if/then` pattern, returns `{discriminatorField, cases: [{rawValue, ref}]}` |
| `buildInterfaceUnionSchema(field, cases)` | Builds `x-discriminated-union` + `x-interface-union` schema with case properties |
| `processDiscriminatorMemberTypes(cases, field, defs)` | Removes discriminator from member types, adds `x-constant-fields` |
| `typeNameFromRef(ref)` | Extracts type name from `$ref` string |
| `toCamelCase(str)` | Converts discriminator values to camelCase for Swift case names |

---

## TypeScript Annotation Reference

| Annotation | On | Effect |
|------------|-----|--------|
| `@discriminator <field>` | Type alias JSDoc | Generates interface discriminated union enum |
| `@format int` | Property JSDoc | Generates `Int` instead of `Double` in Swift |
| `@format frozen` | Property JSDoc | Generates `private let ... : AnyCodable` in Swift |

---

## Commands

### Generate OpenAPI Spec (from kit root)
```bash
pnpm generate-openapi-spec
# or force fresh run:
pnpm turbo generate-openapi-spec --force
```

### Generate Swift Models (from kit-ios root)
```bash
make models WALLETKIT_PATH=/Volumes/Neverland/Development/iOS/ton/kit/packages/walletkit
```

### Build Swift Package (from kit-ios root)
```bash
swift build
```

---

## Adding New Features

### Decision: Parser/Formatter vs Post-processing

- **Parser + Formatter**: Use when detecting a new TypeScript AST pattern (new syntax or type shape). The parser converts AST → custom Type, the formatter converts Type → JSON Schema with vendor extensions.
- **Post-processing**: Use when transforming existing JSON Schema output (e.g., restructuring `allOf`/`if`/`then` patterns that ts-json-schema-generator already produces). Simpler — just manipulate the JSON object.

### Adding a New Vendor Extension

1. **Choose where the extension goes**: On the type definition? On a property? On case entries?
2. **Set it in generate-json-schema.js**: In a formatter's `getDefinition()` or in a post-processing function
3. **Use it in the Mustache template**: `{{#vendorExtensions.x-my-extension}}...{{/vendorExtensions.x-my-extension}}` for type-level, or `{{#myExtension}}...{{/myExtension}}` for custom objects in arrays
4. **Test**: Generate OpenAPI → inspect JSON → generate Swift → inspect output → `swift build`

### Adding a New Parser + Formatter

1. **Create a custom Type class** extending `tsj.BaseType`:
   ```javascript
   class MyCustomType extends tsj.BaseType {
       constructor(name, innerType, metadata) {
           super();
           this.name = name;
           this.innerType = innerType;
           this.metadata = metadata;
       }
       getId() { return `my-custom-${this.name}`; }
   }
   ```

2. **Create a NodeParser**:
   ```javascript
   class MyCustomNodeParser {
       supportsNode(node) { return /* condition */; }
       createType(node, context) {
           return new tsj.DefinitionType(name, new MyCustomType(...));
       }
   }
   ```

3. **Create a TypeFormatter**:
   ```javascript
   class MyCustomTypeFormatter {
       supportsType(type) { return type instanceof MyCustomType; }
       getDefinition(type) {
           return { type: 'object', 'x-my-extension': type.getMetadata() };
       }
       getChildren(type) {
           return this.childTypeFormatter.getChildren(type.getInnerType());
       }
   }
   ```

4. **Register** in the `main` section of generate-json-schema.js (~line 1434):
   ```javascript
   const parser = tsj.createParser(program, config, (prs) => {
       prs.addNodeParser(new MyCustomNodeParser(typeChecker, prs));
   });
   const formatter = tsj.createFormatter(config, (fmt, circularRef) => {
       fmt.addTypeFormatter(new MyCustomTypeFormatter(circularRef));
   });
   ```

5. **Create/modify Mustache template** and update `model.mustache` dispatch if needed

### Important: Parser Priority

Custom parsers registered in the augmentor run **before** default parsers (first match wins). This means custom parsers always take priority.

### Important: Generic Type Filtering

ts-json-schema-generator skips generic types by default. Our `AllTypesSchemaGenerator` overrides `isGenericType()` to allow generic interfaces through.

---

## Gotchas and Common Pitfalls

1. **Empty object types become `AnyCodable`**: openapi-generator resolves `{ "type": "object", "properties": {} }` as a free-form object → `AnyCodable` in Swift. This is why `x-empty-variant` exists — to avoid using the unresolvable type as an associated value.

2. **Types must be exported in `models/index.ts`**: If a type isn't exported there, it won't be in the schema.

3. **Post-processing order matters**: `postProcessDiscriminatedUnions` runs before `postProcessConstantFields`. The discriminator function already handles constant fields for union members, so `postProcessConstantFields` only handles standalone constant fields.

4. **Constant fields are always `String` type**: Single-literal number constants get coerced to string.

5. **`allOf` with single `$ref`**: openapi-generator unwraps `allOf: [{$ref: "..."}]` to just the referenced type. This is how case properties in interface unions resolve to the member type.

6. **TypeScript `type` aliases vs `interface`**: Both work for union members. The discriminator annotation goes on the union type alias itself.

7. **Inline unions need both parent and member processing**: The parent type gets `x-inline-interface-unions` for nested enum rendering. The member types get `x-constant-fields`. The property itself gets `x-interface-union` for type resolution in the struct.

8. **Const-object enum naming**: The `ConstEnumNodeParser` must use the type alias name for the `DefinitionType` (not the const name) because `ReferenceType` unwraps `DefinitionType` and re-wraps with the reference name, creating duplicates. Instead, `x-definition-name` + `postProcessDefinitionNames()` handles the rename.

9. **`(typeof X)[keyof typeof X]` needs parentheses handling**: The TS AST wraps `typeof X` in a `ParenthesizedType` node. The parser's `unwrapParens()` helper strips these before checking for `TypeQuery`.

---

## Known Limitations

1. **TypeScript generic defaults are ignored** — Swift doesn't support default type parameters
2. **Generic constraints not fully supported** — `<T extends Foo>` becomes `<T: Codable>`
3. **Nested generics not supported** — `Container<Wrapper<T>>` won't work
4. **Generic type instantiation not supported** — Can't use `SomeGeneric<string>` in property types
5. **Interface unions require `@discriminator` annotation** — Without it, `allOf` with `if/then` is not recognized
6. **Constant fields are always `String` type** — Single-literal number constants are coerced to string
