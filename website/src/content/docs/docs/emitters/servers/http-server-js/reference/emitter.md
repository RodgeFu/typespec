---
title: "Emitter usage"
---

## Emitter usage

1. Via the command line

```bash
tsp compile . --emit=@typespec/http-server-js
```

2. Via the config

```yaml
emit:
  - "@typespec/http-server-js"
```

The config can be extended with options as follows:

```yaml
emit:
  - "@typespec/http-server-js"
options:
  "@typespec/http-server-js":
    option: value
```

## Emitter options

### `emitter-output-dir`

**Type:** `absolutePath`

Defines the emitter output directory. Defaults to `{output-dir}/@typespec/http-server-js`
See [Configuring output directory for more info](https://typespec.io/docs/handbook/configuration/configuration/#configuring-output-directory)

### `express`

**Type:** `boolean`

If set to `true`, the emitter will generate a router that exposes an Express.js middleware function in addition to the ordinary Node.js HTTP server router.

If this option is not set to `true`, the `expressMiddleware` property will not be present on the generated router.

### `datetime`

**Type:** `"temporal-polyfill" | "temporal" | "date-duration"`

The type of datetime models to use for TypeSpecs DateTime and Duration types.

### `omit-unreachable-types`

**Type:** `boolean`

By default, the emitter will create interfaces that represent all models in the service namespace. If this option is set to `true`, the emitter will only emit those types that are reachable from an HTTP operation.

### `no-format`

**Type:** `boolean`

If set to `true`, the emitter will not format the generated code using Prettier.
