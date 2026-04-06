You are an expert on this project's TypeScript-to-Swift code generation pipeline. Before starting any work, read `.claude/code-generation-system.md` for the full system reference.

## Pipeline Overview

```
TypeScript Models → JSON Schema → OpenAPI 3.0 → Swift Code
     (kit)        (generate-json-schema.js)    (openapi-generator + mustache)
```

**Two repositories:**
- **kit** (`/Volumes/Neverland/Development/iOS/ton/kit`) — TS models + schema generation
- **kit-ios** (`/Volumes/Neverland/Development/iOS/walletkit-ios/kit-ios`) — Swift code generation from OpenAPI

## Key Files

### kit
- `packages/walletkit/src/api/models/` — TS model definitions
- `packages/walletkit/src/api/models/index.ts` — Export barrel (types must be exported here)
- `packages/walletkit/src/api/scripts/generate-json-schema.js` — Custom JSON Schema generator (parsers, formatters, post-processors)
- `packages/walletkit/src/api/scripts/json-schema-to-openapi-spec.js` — JSON Schema → OpenAPI conversion
- `packages/walletkit/src/api/scripts/generate-openapi-spec.sh` — Orchestration script
- `packages/walletkit/src/api/scripts/generated/walletkit-openapi.json` — Generated OpenAPI spec

### kit-ios
- `kit-ios/Scripts/generate-api/templates/` — Mustache templates for Swift generation
- `kit-ios/Scripts/generate-api/generate-api-models.sh` — Generation script
- `kit-ios/Scripts/generate-api/generate-api-models-config.json` — Config (modelNamePrefix: "TON")
- `kit-ios/Sources/TONWalletKit/API/Models/WalletKit/` — Generated Swift output

## Custom Parsers in generate-json-schema.js

| Parser | Detects | Creates |
|--------|---------|---------|
| `ConstEnumNodeParser` | `type X = (typeof Obj)[keyof typeof Obj]` const-object pattern | `EnumTypeWithNames` with `x-definition-name` |
| `EnumNodeParserWithNames` | TypeScript enums | `EnumTypeWithNames` with member names |
| `DiscriminatedUnionNodeParser` | `{ type: 'literal', value?: ... }` unions | `DiscriminatedUnionType` |
| `GenericInterfaceNodeParser` | `interface Foo<T> { ... }` | `GenericInterfaceType` |

Custom parsers are registered with higher priority than defaults (first match wins).

## Post-Processing Functions (run in order)

1. `postProcessDefinitionNames()` — Renames definitions with `x-definition-name`, updates all `$ref`s
2. `postProcessDiscriminatedUnions()` — `@discriminator` unions → `x-discriminated-union` schema
3. `postProcessConstantFields()` — Single-literal properties → `x-constant-fields`
4. `postProcessStripDefaults()` — Removes `@default` annotations
5. `postProcessTypeAliases()` — Pure `$ref` definitions → `x-type-alias`

## Vendor Extensions

| Extension | Purpose |
|-----------|---------|
| `x-definition-name` | Renames definition in post-processing |
| `x-enum-varnames` | Enum member names in camelCase |
| `x-discriminated-union` | Marks discriminated union types |
| `x-interface-union` | Interface-based union variant |
| `x-discriminator-field` | JSON field used as discriminator |
| `x-empty-variant` | Union case with no associated value |
| `x-enum-case-name` | camelCase Swift case name |
| `x-enum-case-raw-value` | Original JSON discriminator value |
| `x-constant-fields` | Constant fields with fixed values |
| `x-frozen` | Opaque field → `AnyCodable` |
| `x-is-generic` / `x-generic-params` / `x-generic-type-ref` | Generics support |
| `x-type-alias` / `x-alias-target` | Type alias support |

## Mustache Template Dispatch

```
model.mustache:
  x-type-alias?          → typealias (inline)
    x-discriminated-union? → modelDiscriminatedEnum.mustache
      x-is-generic?        → modelGeneric.mustache
      x-is-one-of?         → modelOneOf.mustache
        isArray?           → modelArray
          isEnum?          → modelEnum.mustache
            else           → modelAllOf.mustache → modelObject.mustache
```

## TS Annotations

| Annotation | On | Effect |
|------------|-----|--------|
| `@discriminator <field>` | Type alias JSDoc | Generates discriminated union enum |
| `@format int` | Property JSDoc | Generates `Int` instead of `Double` |
| `@format frozen` | Property JSDoc | Generates `private let ... : AnyCodable` |

## Commands

```bash
# Generate OpenAPI spec (from kit root)
pnpm generate-openapi-spec

# Generate Swift models (from kit-ios root)
make models WALLETKIT_PATH=/Volumes/Neverland/Development/iOS/ton/kit/packages/walletkit

# Build Swift package (from kit-ios root)
swift build
```

## Critical Gotchas

1. Types must be exported in `models/index.ts` to appear in schema
2. `ConstEnumNodeParser` must use the type alias name for `DefinitionType` (not the const name) — `ReferenceType` unwraps and re-wraps with the reference name, creating duplicates. Use `x-definition-name` + `postProcessDefinitionNames()` instead.
3. `(typeof X)[keyof typeof X]` AST wraps `typeof X` in `ParenthesizedType` — use `unwrapParens()` helper
4. Empty object types become `AnyCodable` — use `x-empty-variant` to avoid
5. Post-processing order matters — `postProcessDefinitionNames` must run first
6. Custom parsers run before defaults (first match wins)
7. `AllTypesSchemaGenerator` overrides `isGenericType()` to allow generic interfaces

## How to Add New Features

**Parser/Formatter approach** — for new TS AST patterns:
1. Create custom Type class extending `tsj.BaseType`
2. Create NodeParser with `supportsNode()` and `createType()`
3. Create TypeFormatter with `supportsType()`, `getDefinition()`, `getChildren()`
4. Register in `generate-json-schema.js` main section
5. Create/modify Mustache template

**Post-processing approach** — for transforming existing JSON Schema output:
1. Add function that manipulates the schema JSON object
2. Call it in the post-processing chain in the main section
3. Mind the ordering relative to other post-processors

$ARGUMENTS
