GitHub Copilot: Here's a concise, accurate, and refined guideline for creating TypeSpec (`*.tsp` and `tspconfig.yaml`) files for Azure services, suitable as a quick reference:

## ✅ **Recommended File Structure**

```
specification/{service}/{package}/
├── main.tsp          # Service metadata, versioning, auth
├── models.tsp        # Data models and enums
├── routes.tsp        # REST operations and interfaces
├── common.tsp        # Reusable definitions (headers, operations)
├── client.tsp        # Client interface definitions and customizations
└── tspconfig.yaml    # Emitter and SDK generation configuration
```

---

## ✅ **main.tsp**

Define service metadata, versioning, and authentication clearly:

```tsp
import "@typespec/rest";
import "@typespec/versioning";
import "@azure-tools/typespec-azure-core";

@service(#{ title: "Your Service Name" })
@versioned(Versions)
@server("{endpoint}", "Service description", {
  endpoint: url,
})
@useAuth(
  OAuth2Auth<[
    {
      type: OAuth2FlowType.implicit,
      authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      scopes: ["https://{service}.azure.com/.default"],
    }
  ]>
)
namespace Azure.{Service};

enum Versions {
  @useDependency(Azure.Core.Versions.v1_0_Preview_2)
  v2024_07_01: "2024-07-01",
}
```

---

## ✅ **models.tsp**

Clearly document and define data models and enums:

```tsp
@doc("Description of the resource.")
model MyResource {
  @key("resourceId")
  id: string;

  name: string;
  location: string;
}

@doc("Provisioning state of resource.")
union ProvisioningState {
  Succeeded: "Succeeded",
  Failed: "Failed",
  Canceled: "Canceled",
  Provisioning: "Provisioning",
}
```

---

## ✅ **routes.tsp**

Define REST operations and interfaces explicitly:

```tsp
@route("/resources")
interface Resources {
  @get listResources(): MyResource[];
  @post createResource(@body resource: MyResource): MyResource;
}
```

---

## ✅ **common.tsp**

Define reusable operations, headers, and aliases:

```tsp
alias CommonResponseHeaders = {
  @header("request-id")
  requestId?: string;
};

@get
op ListOperation<TResponse>(): TResponse | ErrorResponse;
```

---

## ✅ **client.tsp**

Define client interfaces and customizations clearly:

```tsp
@client({
  name: "MyServiceClient",
  service: Azure.MyService,
})
interface MyServiceClient {
  listResources is Azure.MyService.Resources.listResources;
  createResource is Azure.MyService.Resources.createResource;
}

// Client-specific overrides
@@clientName(MyServiceClient.listResources, "listResourcesInternal", "java");
@@access(Azure.MyService.Resources.createResource, Access.internal, "csharp");
```

---

## ✅ **tspconfig.yaml**

Configure emitters and SDK generation explicitly:

```yaml
emit:
  - "@azure-tools/typespec-autorest"
  - "@azure-tools/typespec-csharp"
  - "@azure-tools/typespec-java"
  - "@azure-tools/typespec-python"
  - "@azure-tools/typespec-ts"

options:
  "@azure-tools/typespec-autorest":
    azure-resource-provider-folder: "./data-plane"
    emitter-output-dir: "{project-root}/.."
    output-file: "{azure-resource-provider-folder}/{service}/preview/{version}/{service}.json"

  "@azure-tools/typespec-csharp":
    package-dir: "Azure.MyService"
    namespace: Azure.MyService
    flavor: azure

  "@azure-tools/typespec-java":
    namespace: "com.azure.myservice"
    package-dir: "azure-myservice"
    flavor: azure

  "@azure-tools/typespec-python":
    package-dir: "azure-myservice"
    flavor: azure

  "@azure-tools/typespec-ts":
    package-dir: "myservice-rest"
    packageDetails:
      name: "@azure-rest/myservice"
      description: "MyService REST Client"
      version: "1.0.0-beta.1"
    flavor: azure
```

---

## ✅ **Generating SDKs**

Run the TypeSpec compiler to generate SDKs:

```bash
tsp compile specification/{service}/{package}/main.tsp
```

---

## ✅ **Best Practices**

- Clearly document each operation and model using `@doc`.
- Follow Azure REST API conventions for naming, routing, and versioning.
- Separate concerns clearly: models, routes, common definitions, client definitions.
- Use suppressions judiciously with clear explanations:
  ```tsp
  #suppress "@azure-tools/typespec-azure-core/no-response-body" "Legacy behavior"
  ```
- Explicitly configure emitters in `tspconfig.yaml`.

This refined guideline ensures consistency, readability, maintainability, and alignment with Azure SDK best practices.
