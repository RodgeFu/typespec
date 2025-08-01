import { TypeSpecHttpDecorators } from "../generated-defs/TypeSpec.Http.js";
import { TypeSpecHttpPrivateDecorators } from "../generated-defs/TypeSpec.Http.Private.js";
import {
  $body,
  $bodyIgnore,
  $bodyRoot,
  $cookie,
  $delete,
  $get,
  $head,
  $header,
  $multipartBody,
  $patch,
  $path,
  $post,
  $put,
  $query,
  $server,
  $statusCode,
  $useAuth,
} from "./decorators.js";
import { $route } from "./decorators/route.js";
import { $sharedRoute } from "./decorators/shared-route.js";
import { $applyMergePatch, $mergePatchModel, $mergePatchProperty } from "./merge-patch.js";
import {
  $httpFile,
  $httpPart,
  $includeInapplicableMetadataInPayload,
  $plainData,
} from "./private.decorators.js";

export { $lib } from "./lib.js";
export { $onValidate } from "./validate.js";

/** @internal */
export const $decorators = {
  "TypeSpec.Http": {
    body: $body,
    bodyIgnore: $bodyIgnore,
    bodyRoot: $bodyRoot,
    cookie: $cookie,
    delete: $delete,
    get: $get,
    header: $header,
    head: $head,
    multipartBody: $multipartBody,
    patch: $patch,
    path: $path,
    post: $post,
    put: $put,
    query: $query,
    route: $route,
    server: $server,
    sharedRoute: $sharedRoute,
    statusCode: $statusCode,
    useAuth: $useAuth,
  } satisfies TypeSpecHttpDecorators,
  "TypeSpec.Http.Private": {
    httpFile: $httpFile,
    httpPart: $httpPart,
    plainData: $plainData,
    includeInapplicableMetadataInPayload: $includeInapplicableMetadataInPayload,
    applyMergePatch: $applyMergePatch,
    mergePatchModel: $mergePatchModel,
    mergePatchProperty: $mergePatchProperty,
  } satisfies TypeSpecHttpPrivateDecorators,
};
