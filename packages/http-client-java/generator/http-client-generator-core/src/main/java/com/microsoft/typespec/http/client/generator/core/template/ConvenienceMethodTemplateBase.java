// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

package com.microsoft.typespec.http.client.generator.core.template;

import com.azure.core.util.FluxUtil;
import com.azure.core.util.serializer.CollectionFormat;
import com.azure.core.util.serializer.JacksonAdapter;
import com.azure.core.util.serializer.TypeReference;
import com.microsoft.typespec.http.client.generator.core.extension.model.codemodel.RequestParameterLocation;
import com.microsoft.typespec.http.client.generator.core.extension.plugin.JavaSettings;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.Annotation;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.ClassType;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.ClientMethod;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.ClientMethodParameter;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.ClientMethodType;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.ClientModel;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.ClientModelProperty;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.ConvenienceMethod;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.EnumType;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.GenericType;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.IType;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.IterableType;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.MapType;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.MethodPageDetails;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.ParameterMapping;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.ParameterSynthesizedOrigin;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.ParameterTransformation;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.ParameterTransformations;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.PrimitiveType;
import com.microsoft.typespec.http.client.generator.core.model.clientmodel.ProxyMethodParameter;
import com.microsoft.typespec.http.client.generator.core.model.javamodel.JavaBlock;
import com.microsoft.typespec.http.client.generator.core.model.javamodel.JavaClass;
import com.microsoft.typespec.http.client.generator.core.model.javamodel.JavaType;
import com.microsoft.typespec.http.client.generator.core.model.javamodel.JavaVisibility;
import com.microsoft.typespec.http.client.generator.core.template.util.ModelTemplateHeaderHelper;
import com.microsoft.typespec.http.client.generator.core.util.ClientModelUtil;
import com.microsoft.typespec.http.client.generator.core.util.CodeNamer;
import com.microsoft.typespec.http.client.generator.core.util.MethodUtil;
import com.microsoft.typespec.http.client.generator.core.util.TemplateUtil;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.BiFunction;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.stream.Collectors;

abstract class ConvenienceMethodTemplateBase {

    protected ConvenienceMethodTemplateBase() {
    }

    public void write(ConvenienceMethod convenienceMethodObj, JavaClass classBlock,
        Set<GenericType> typeReferenceStaticClasses) {
        if (!isMethodIncluded(convenienceMethodObj)) {
            return;
        }

        ClientMethod protocolMethod = convenienceMethodObj.getProtocolMethod();
        convenienceMethodObj.getConvenienceMethods()
            .stream()
            .filter(this::isMethodIncluded)
            .forEach(convenienceMethod -> {
                // javadoc
                classBlock.javadocComment(comment -> ClientMethodTemplate.generateJavadoc(convenienceMethod, comment,
                    convenienceMethod.getProxyMethod(), false));

                addGeneratedAnnotation(classBlock);
                TemplateUtil.writeClientMethodServiceMethodAnnotation(convenienceMethod, classBlock);

                JavaVisibility methodVisibility = convenienceMethod.getMethodVisibilityInWrapperClient();

                // convenience method
                String methodDeclaration
                    = String.format("%1$s %2$s(%3$s)", convenienceMethod.getReturnValue().getType(),
                        getMethodName(convenienceMethod), convenienceMethod.getParametersDeclaration());
                classBlock.method(methodVisibility, null, methodDeclaration, methodBlock -> {
                    methodBlock.line("// Generated convenience method for " + getMethodName(protocolMethod));

                    writeMethodImplementation(protocolMethod, convenienceMethod, methodBlock,
                        typeReferenceStaticClasses);
                });
            });
    }

    /**
     * Write the implementation of the convenience method.
     *
     * @param protocolMethod the protocol method.
     * @param convenienceMethod the convenience method.
     * @param methodBlock the code block.
     */
    protected void writeMethodImplementation(ClientMethod protocolMethod, ClientMethod convenienceMethod,
        JavaBlock methodBlock, Set<GenericType> typeReferenceStaticClasses) {

        // matched parameters from convenience method to protocol method
        Map<MethodParameter, MethodParameter> parametersMap
            = findParametersForConvenienceMethod(convenienceMethod, protocolMethod);

        // RequestOptions
        createEmptyRequestOptions(methodBlock);

        // parameter transformation
        final ParameterTransformations transformations = convenienceMethod.getParameterTransformations();
        if (!transformations.isEmpty()) {
            transformations.asStream().forEach(d -> {
                ClientMethodParameter requestBodyClientParameter
                    = writeParameterTransformation(d, convenienceMethod, protocolMethod, methodBlock, parametersMap);
                if (requestBodyClientParameter != null && !requestBodyClientParameter.isRequired()) {
                    // protocol method parameter does not exist, set the parameter via RequestOptions
                    methodBlock.line("requestOptions.setBody(" + requestBodyClientParameter.getName() + ");");
                }
            });
        }

        writeValidationForVersioning(convenienceMethod, parametersMap.keySet(), methodBlock);

        boolean isJsonMergePatchOperation = protocolMethod != null
            && protocolMethod.getProxyMethod() != null
            && "application/merge-patch+json".equalsIgnoreCase(protocolMethod.getProxyMethod().getRequestContentType());
        Map<String, String> parameterExpressionsMap = new HashMap<>();
        for (Map.Entry<MethodParameter, MethodParameter> entry : parametersMap.entrySet()) {
            MethodParameter parameter = entry.getKey();
            MethodParameter protocolParameter = entry.getValue();

            if (parameter.getProxyMethodParameter() != null
                && parameter.getProxyMethodParameter().getOrigin() == ParameterSynthesizedOrigin.CONTEXT) {
                // Context
                methodBlock.line(String.format("requestOptions.setContext(%s);", parameter.getName()));
            } else if (protocolParameter != null) {
                // protocol method parameter exists
                String expression = expressionConvertToType(parameter.getName(), parameter,
                    protocolMethod.getProxyMethod().getRequestContentType());
                parameterExpressionsMap.put(protocolParameter.getName(), expression);
            } else if (parameter.getProxyMethodParameter() != null) {
                // protocol method parameter does not exist, set the parameter via RequestOptions
                switch (parameter.getProxyMethodParameter().getRequestParameterLocation()) {
                    case HEADER:
                        writeHeader(parameter, methodBlock);
                        break;

                    case QUERY:
                        writeQueryParam(parameter, methodBlock);
                        break;

                    case BODY:
                        Consumer<JavaBlock> writeLine = javaBlock -> {
                            IType parameterType = parameter.getClientMethodParameter().getClientType();
                            String expression = expressionConvertToBinaryData(parameter.getName(),
                                parameter.getClientMethodParameter().getWireType(),
                                protocolMethod.getProxyMethod().getRequestContentType());

                            if (isJsonMergePatchOperation
                                && ClientModelUtil.isClientModel(parameterType)
                                && ClientModelUtil.isJsonMergePatchModel(
                                    ClientModelUtil.getClientModel(((ClassType) parameterType).getName()),
                                    JavaSettings.getInstance())) {
                                String variableName = writeParameterConversionExpressionWithJsonMergePatchEnabled(
                                    javaBlock, parameterType.toString(), parameter.getName(), expression);
                                addRequestCallback(javaBlock, variableName);
                            } else {
                                addRequestCallback(javaBlock, expression);
                            }
                        };
                        if (!parameter.getClientMethodParameter().isRequired()) {
                            methodBlock.ifBlock(parameter.getName() + " != null", writeLine);
                        } else {
                            writeLine.accept(methodBlock);
                        }
                        break;
                }
            }
        }

        // invocation with protocol method parameters and RequestOptions
        String invocationExpression = protocolMethod.getMethodInputParameters().stream().map(p -> {
            String parameterName = p.getName();
            String expression = parameterExpressionsMap.get(parameterName);
            IType parameterRawType = p.getRawType();
            if (isJsonMergePatchOperation
                && ClientModelUtil.isClientModel(parameterRawType)
                && RequestParameterLocation.BODY.equals(p.getRequestParameterLocation())
                && ClientModelUtil.isJsonMergePatchModel(
                    ClientModelUtil.getClientModel(((ClassType) parameterRawType).getName()),
                    JavaSettings.getInstance())) {
                return writeParameterConversionExpressionWithJsonMergePatchEnabled(methodBlock,
                    parameterRawType.toString(), parameterName, expression);
            } else {
                return expression == null ? parameterName : expression;
            }
        }).collect(Collectors.joining(", "));

        // write the invocation of protocol method, and related type conversion
        writeInvocationAndConversion(convenienceMethod, protocolMethod, invocationExpression, methodBlock,
            typeReferenceStaticClasses);
    }

    protected void addRequestCallback(JavaBlock javaBlock, String variableName) {
        javaBlock.line("requestOptions.setBody(" + variableName + ");");
    }

    protected void createEmptyRequestOptions(JavaBlock methodBlock) {
        methodBlock.line("RequestOptions requestOptions = new RequestOptions();");
    }

    /**
     * Write the validation for parameters against current api-version.
     *
     * @param parameters the parameters
     * @param methodBlock the method block
     */
    protected void writeValidationForVersioning(ClientMethod convenienceMethod, Set<MethodParameter> parameters,
        JavaBlock methodBlock) {
        // validate parameter for versioning
        for (MethodParameter parameter : parameters) {
            if (parameter.getClientMethodParameter().getVersioning() != null
                && parameter.getClientMethodParameter().getVersioning().getAdded() != null) {
                String condition
                    = String.format("!Arrays.asList(%s).contains(serviceClient.getServiceVersion().getVersion())",
                        parameter.getClientMethodParameter()
                            .getVersioning()
                            .getAdded()
                            .stream()
                            .map(ClassType.STRING::defaultValueExpression)
                            .collect(Collectors.joining(", ")));
                methodBlock.ifBlock(condition, ifBlock -> {
                    String exceptionExpression = String.format(
                        "new IllegalArgumentException(\"Parameter %1$s is only available in api-version %2$s.\")",
                        parameter.getName(),
                        String.join(", ", parameter.getClientMethodParameter().getVersioning().getAdded()));
                    writeThrowException(convenienceMethod.getType(), exceptionExpression, ifBlock);
                });
            }
        }
    }

    abstract void writeThrowException(ClientMethodType methodType, String exceptionExpression, JavaBlock methodBlock);

    /**
     * Writes the code for parameter transformation.
     * Return the client parameter of the request body, if the BinaryData of the object is written.
     *
     * @param transformation the parameter transformation
     * @param convenienceMethod the convenience method
     * @param protocolMethod the protocol method
     * @param methodBlock the block to write code
     * @param parametersMap the map of matched parameters from convenience method to protocol method
     * @return the client parameter of request body, if the BinaryData of the object is written.
     */
    private static ClientMethodParameter writeParameterTransformation(ParameterTransformation transformation,
        ClientMethod convenienceMethod, ClientMethod protocolMethod, JavaBlock methodBlock,
        Map<MethodParameter, MethodParameter> parametersMap) {

        ClientMethodParameter requestBodyClientParameter = null;

        if (transformation.isGroupBy()) {
            // parameter grouping
            /*
             * sample code:
             * String id = options.getId();
             * String header = options.getHeader();
             */
            final ClientMethodParameter sourceParameter = transformation.getGroupByInParameter();

            boolean sourceParameterInMethod = false;
            for (MethodParameter parameter : parametersMap.keySet()) {
                if (parameter.clientMethodParameter != null
                    && parameter.clientMethodParameter.getName() != null
                    && Objects.equals(parameter.clientMethodParameter.getName(), sourceParameter.getName())) {
                    sourceParameterInMethod = true;
                    break;
                }
            }

            if (sourceParameterInMethod) {
                // null check on input parameter
                String assignmentExpression = "%1$s %2$s = %3$s.%4$s();";
                if (!sourceParameter.isRequired()) {
                    assignmentExpression = "%1$s %2$s = %3$s == null ? null : %3$s.%4$s();";
                }

                methodBlock.line(String.format(assignmentExpression, transformation.getOutParameter().getClientType(),
                    transformation.getOutParameter().getName(), sourceParameter.getName(),
                    CodeNamer.getModelNamer().modelPropertyGetterName(transformation.getGroupByInParameterProperty())));

                if (transformation.getOutParameter().getRequestParameterLocation() != null) {
                    ClientMethodParameter clientMethodParameter = transformation.getOutParameter();
                    ProxyMethodParameter proxyMethodParameter = convenienceMethod.getProxyMethod()
                        .getAllParameters()
                        .stream()
                        .filter(p -> clientMethodParameter.getName()
                            .equals(CodeNamer.getEscapedReservedClientMethodParameterName(p.getName())))
                        .findFirst()
                        .orElse(null);
                    if (proxyMethodParameter != null) {
                        MethodParameter methodParameter
                            = new MethodParameter(proxyMethodParameter, clientMethodParameter);
                        parametersMap.put(methodParameter,
                            findProtocolMethodParameterForConvenienceMethod(methodParameter, protocolMethod));
                    }
                }
            }
        } else {
            // request body flatten (possible with parameter grouping, handled in "mapping.getInParameterProperty()")
            /*
             * sample code:
             * Body bodyObj = new Body(name).setProperty(options.getProperty());
             * BinaryData body = BinaryData.fromObject(bodyObj);
             */
            ClientMethodParameter targetParameter = transformation.getOutParameter();

            // if the request body is optional, when this client method overload contains only required parameters,
            // body expression is not needed (as there is no property in this overload for the request body)
            final boolean noBodyPropertyForOptionalBody
                = !targetParameter.isRequired() && convenienceMethod.getOnlyRequiredParameters();
            if (!noBodyPropertyForOptionalBody && targetParameter.getWireType() == ClassType.BINARY_DATA) {
                IType targetType = targetParameter.getRawType();

                StringBuilder ctorExpression = new StringBuilder();
                StringBuilder setterExpression = new StringBuilder();
                String targetParameterName = targetParameter.getName();
                String targetParameterObjectName = targetParameterName + "Obj";
                for (ParameterMapping mapping : transformation.getMappings()) {
                    String parameterName = mapping.getInParameter().getName();

                    String inputPath = parameterName;
                    boolean propertyRequired = mapping.getInParameter().isRequired();
                    if (mapping.getInParameterProperty() != null) {
                        inputPath = String.format("%s.%s()", mapping.getInParameter().getName(),
                            CodeNamer.getModelNamer().modelPropertyGetterName(mapping.getInParameterProperty()));
                        propertyRequired = mapping.getInParameterProperty().isRequired();
                    }
                    if (propertyRequired) {
                        // required
                        if (JavaSettings.getInstance().isRequiredFieldsAsConstructorArgs()) {
                            if (ctorExpression.length() > 0) {
                                ctorExpression.append(", ");
                            }
                            ctorExpression.append(inputPath);
                        } else {
                            setterExpression.append(".")
                                .append(mapping.getOutParameterProperty().getSetterName())
                                .append("(")
                                .append(inputPath)
                                .append(")");
                        }
                    } else if (!convenienceMethod.getOnlyRequiredParameters()) {
                        // optional
                        setterExpression.append(".")
                            .append(mapping.getOutParameterProperty().getSetterName())
                            .append("(")
                            .append(inputPath)
                            .append(")");
                    }
                }
                methodBlock.line(String.format("%1$s %2$s = new %1$s(%3$s)%4$s;", targetType, targetParameterObjectName,
                    ctorExpression, setterExpression));

                String expression = null;
                if (targetParameter.getRawType() instanceof ClassType) {
                    ClientModel model = ClientModelUtil.getClientModel(targetParameter.getRawType().toString());
                    // serialize model for multipart/form-data
                    if (model != null && ClientModelUtil.isMultipartModel(model)) {
                        expression = expressionMultipartFormDataToBinaryData(targetParameterObjectName, model);
                    }
                }
                if (expression == null) {
                    expression = expressionConvertToBinaryData(targetParameterObjectName, targetParameter.getRawType(),
                        protocolMethod.getProxyMethod().getRequestContentType());
                }
                methodBlock.line(String.format("BinaryData %1$s = %2$s;", targetParameterName, expression));

                requestBodyClientParameter = targetParameter;
            }
        }
        return requestBodyClientParameter;
    }

    protected void addImports(Set<String> imports, List<ConvenienceMethod> convenienceMethods) {
        // methods
        JavaSettings settings = JavaSettings.getInstance();
        convenienceMethods.stream().flatMap(m -> m.getConvenienceMethods().stream()).forEach(m -> {
            // we need classes many of its parameters and models, hence "includeImplementationImports=true"
            m.addImportsTo(imports, true, settings);

            // add imports from models, as some convenience API need to process model properties
            for (ClientMethodParameter p : m.getParameters()) {
                if (p.getWireType() instanceof ClassType) {
                    ClientModel model = ClientModelUtil.getClientModel(p.getWireType().toString());
                    if (model != null) {
                        model.addImportsTo(imports, settings);
                    }
                }
            }
        });

        ClassType.HTTP_HEADER_NAME.addImportsTo(imports, false);
        ClassType.BINARY_DATA.addImportsTo(imports, false);
        ClassType.REQUEST_OPTIONS.addImportsTo(imports, false);
        ClassType.REQUEST_CONTEXT.addImportsTo((imports), false);
        imports.add(Collectors.class.getName());
        imports.add(Objects.class.getName());
        imports.add(FluxUtil.class.getName());

        // collection format
        imports.add(JacksonAdapter.class.getName());
        imports.add(CollectionFormat.class.getName());
        imports.add(TypeReference.class.getName());
        if (!JavaSettings.getInstance().isAzureV1() || JavaSettings.getInstance().isAzureV2()) {
            imports.add(Type.class.getName());
            imports.add(ParameterizedType.class.getName());
        }

        // byte[]
        ClassType.BASE_64_URL.addImportsTo(imports, false);

        // flatten payload
        imports.add(Map.class.getName());
        imports.add(HashMap.class.getName());

        // MultipartFormDataHelper class
        imports.add(settings.getPackage(settings.getImplementationSubpackage()) + "."
            + ClientModelUtil.MULTI_PART_FORM_DATA_HELPER_CLASS_NAME);

        // versioning
        imports.add(Arrays.class.getName());

        // JsonMergePatchHelper class
        imports.add(settings.getPackage(settings.getImplementationSubpackage()) + "."
            + ClientModelUtil.JSON_MERGE_PATCH_HELPER_CLASS_NAME);
    }

    protected void addGeneratedAnnotation(JavaType typeBlock) {
        if (JavaSettings.getInstance().isAzureV1()) {
            typeBlock.annotation(Annotation.GENERATED.getName());
        } else {
            typeBlock.annotation(Annotation.METADATA.getName() + "(properties = {MetadataProperties.GENERATED})");
        }
    }

    /**
     * Whether the convenience method should be included.
     *
     * @param method the convenience method.
     * @return Whether include the convenience method.
     */
    protected abstract boolean isMethodIncluded(ClientMethod method);

    /**
     * Whether the convenience/protocol method should be included.
     *
     * @param method the convenience/protocol method.
     * @return Whether include the convenience/protocol method.
     */
    protected abstract boolean isMethodIncluded(ConvenienceMethod method);

    protected boolean isMethodAsync(ClientMethod method) {
        return method.getType().name().contains("Async");
    }

    protected boolean isMethodVisible(ClientMethod method) {
        return method.getMethodVisibility() == JavaVisibility.Public;
    }

    protected String getMethodName(ClientMethod method) {
        if (isMethodAsync(method)) {
            return method.getName().endsWith("Async")
                ? method.getName().substring(0, method.getName().length() - "Async".length())
                : method.getName();
        } else {
            return method.getName();
        }
    }

    /**
     * Write the code of the method invocation of client method, and the conversion of parameters and return value.
     *
     * @param convenienceMethod the convenience method.
     * @param protocolMethod the protocol method.
     * @param invocationExpression the prepared expression of invocation on client method.
     * @param methodBlock the code block.
     */
    protected abstract void writeInvocationAndConversion(ClientMethod convenienceMethod, ClientMethod protocolMethod,
        String invocationExpression, JavaBlock methodBlock, Set<GenericType> typeReferenceStaticClasses);

    protected boolean isModelOrBuiltin(IType type) {
        // TODO: other built-in types
        return type == ClassType.STRING // string
            || type == ClassType.OBJECT // unknown
            || type == ClassType.BIG_DECIMAL // decimal
            || (type instanceof PrimitiveType && type.asNullable() != ClassType.VOID) // boolean, int, float, etc.
            || ClientModelUtil.isClientModel(type); // client model
    }

    protected enum SupportedMimeType {
        TEXT, XML, MULTIPART, BINARY, JSON;

        // azure-core SerializerEncoding.SUPPORTED_MIME_TYPES
        private static final Map<String, SupportedMimeType> SUPPORTED_MIME_TYPES
            = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        static {
            SUPPORTED_MIME_TYPES.put("text/xml", SupportedMimeType.XML);
            SUPPORTED_MIME_TYPES.put("application/xml", SupportedMimeType.XML);
            SUPPORTED_MIME_TYPES.put("application/json", SupportedMimeType.JSON);
            SUPPORTED_MIME_TYPES.put("text/css", SupportedMimeType.TEXT);
            SUPPORTED_MIME_TYPES.put("text/csv", SupportedMimeType.TEXT);
            SUPPORTED_MIME_TYPES.put("text/html", SupportedMimeType.TEXT);
            SUPPORTED_MIME_TYPES.put("text/javascript", SupportedMimeType.TEXT);
            SUPPORTED_MIME_TYPES.put("text/plain", SupportedMimeType.TEXT);
            // not in azure-core
            SUPPORTED_MIME_TYPES.put("application/merge-patch+json", SupportedMimeType.JSON);
        }

        public static SupportedMimeType getResponseKnownMimeType(Collection<String> mediaTypes) {
            // rfc https://datatracker.ietf.org/doc/html/rfc7231#section-5.3.2

            // Response adds a "application/json;q=0.9" if no "application/json" specified in media types.
            // This is mostly for the error response which is in JSON, and is not included in this calculation.

            for (String mediaType : mediaTypes) {
                // The declared mime type can be of the form "application/json; charset=utf-8" or "application/json"
                // So, we have to check if the mediaType starts with the supported mime type
                if (!mediaType.equals(MethodUtil.CONTENT_TYPE_APPLICATION_JSON_ERROR_WEIGHT)) { // skip the error media
                                                                                                // type
                    int semicolonIndex = mediaType.indexOf(';');
                    String mediaTypeWithoutParameter
                        = semicolonIndex >= 0 ? mediaType.substring(0, semicolonIndex) : mediaType;

                    SupportedMimeType type = SUPPORTED_MIME_TYPES.entrySet()
                        .stream()
                        .filter(supportedMimeType -> mediaTypeWithoutParameter.equals(supportedMimeType.getKey()))
                        .map(Map.Entry::getValue)
                        .findFirst()
                        .orElse(null);

                    if (mediaTypeWithoutParameter.startsWith("application/")
                        && mediaTypeWithoutParameter.endsWith("+json")) {
                        // special handling for "+json", rfc https://datatracker.ietf.org/doc/html/rfc6839#section-3.1
                        type = SupportedMimeType.JSON;

                        // TODO: we may need to handle "+xml" as well
                    }

                    if (type != null) {
                        return type;
                    }
                }
            }
            return SupportedMimeType.BINARY;    // BINARY if not recognized
        }
    }

    private static String expressionConvertToBinaryData(String name, IType type, String mediaType) {
        SupportedMimeType mimeType = SupportedMimeType.getResponseKnownMimeType(Collections.singleton(mediaType));
        switch (mimeType) {
            case TEXT:
                return "BinaryData.fromString(" + name + ")";

            case BINARY:
                return name;

            default:
                // JSON etc.
                if (type == ClassType.BINARY_DATA) {
                    return name;
                } else {
                    if (type == ClassType.BASE_64_URL) {
                        return "BinaryData.fromObject(" + ClassType.BASE_64_URL.getName() + ".encode(" + name + "))";
                    } else if (type instanceof EnumType) {
                        return "BinaryData.fromObject(" + name + " == null ? null : " + name + "."
                            + ((EnumType) type).getToMethodName() + "())";
                    } else {
                        return "BinaryData.fromObject(" + name + ")";
                    }
                }
        }
    }

    private static void writeHeader(MethodParameter parameter, JavaBlock methodBlock) {
        Consumer<JavaBlock> writeLine
            = javaBlock -> javaBlock.line(String.format("requestOptions.setHeader(%1$s, %2$s);",
                ModelTemplateHeaderHelper.getHttpHeaderNameInstanceExpression(parameter.getSerializedName()),
                expressionConvertToString(parameter.getName(), parameter.getClientMethodParameter().getWireType(),
                    parameter.getProxyMethodParameter())));
        if (!parameter.getClientMethodParameter().isRequired()) {
            methodBlock.ifBlock(String.format("%s != null", parameter.getName()), writeLine);
        } else {
            writeLine.accept(methodBlock);
        }
    }

    protected void writeQueryParam(MethodParameter parameter, JavaBlock methodBlock) {
        Consumer<JavaBlock> writeLine;
        if (parameter.proxyMethodParameter.getExplode()
            && parameter.getClientMethodParameter().getWireType() instanceof IterableType) {
            // multi
            IType elementType = ((IterableType) parameter.getClientMethodParameter().getWireType()).getElementType();
            String elementTypeExpression
                = expressionConvertToString("paramItemValue", elementType, parameter.getProxyMethodParameter());
            writeLine = javaBlock -> {
                String addQueryParamLine = getAddQueryParamExpression(parameter, elementTypeExpression);

                javaBlock.line(String.format("for (%1$s paramItemValue : %2$s) {", elementType, parameter.getName()));
                javaBlock.indent(() -> {
                    if (elementType instanceof PrimitiveType) {
                        javaBlock.line(addQueryParamLine);
                    } else {
                        javaBlock.ifBlock("paramItemValue != null", ifBlock -> ifBlock.line(addQueryParamLine));
                    }
                });
                javaBlock.line("}");
            };
        } else {
            writeLine = javaBlock -> javaBlock
                .line(getAddQueryParamExpression(parameter, expressionConvertToString(parameter.getName(),
                    parameter.getClientMethodParameter().getWireType(), parameter.getProxyMethodParameter())));
        }
        if (!parameter.getClientMethodParameter().isRequired()) {
            methodBlock.ifBlock(String.format("%s != null", parameter.getName()), writeLine);
        } else {
            writeLine.accept(methodBlock);
        }
    }

    protected String getAddQueryParamExpression(MethodParameter parameter, String variable) {
        return String.format("requestOptions.addQueryParam(%1$s, %2$s, %3$s);",
            ClassType.STRING.defaultValueExpression(parameter.getSerializedName()), variable,
            parameter.getProxyMethodParameter().getAlreadyEncoded());
    }

    private static String expressionConvertToString(String name, IType type, ProxyMethodParameter parameter) {
        if (type == ClassType.STRING) {
            return name;
        } else if (type instanceof EnumType) {
            // enum
            EnumType enumType = (EnumType) type;
            if (enumType.getElementType() == ClassType.STRING) {
                return name + ".toString()";
            } else {
                return String.format("String.valueOf(%1$s.%2$s())", name, enumType.getToMethodName());
            }
        } else if (type instanceof IterableType) {
            if (parameter.getCollectionFormat() == CollectionFormat.MULTI && parameter.getExplode()) {
                // multi, RestProxy will handle the array with "multipleQueryParams = true"
                return name;
            } else {
                String delimiter
                    = ClassType.STRING.defaultValueExpression(parameter.getCollectionFormat().getDelimiter());
                IType elementType = ((IterableType) type).getElementType();
                if (elementType instanceof EnumType) {
                    // EnumTypes should provide a toString implementation that represents the wire value.
                    // Circumvent the use of JacksonAdapter and handle this manually.
                    EnumType enumType = (EnumType) elementType;
                    // Not enums will be backed by Strings. Get the backing value before converting to string, this
                    // will prevent using the enum name rather than the enum value when it isn't a String-based
                    // enum. Ex, a long-based enum with value 100 called HIGH will return "100" rather than
                    // "HIGH".
                    String enumToString = enumType.getElementType() == ClassType.STRING
                        ? "paramItemValue"
                        : "paramItemValue == null ? null : paramItemValue." + enumType.getToMethodName() + "()";
                    return name + ".stream()\n" + "    .map(paramItemValue -> Objects.toString(" + enumToString
                        + ", \"\"))\n" + "    .collect(Collectors.joining(" + delimiter + "))";
                } else if (elementType == ClassType.STRING
                    || (elementType instanceof ClassType && ((ClassType) elementType).isBoxedType())) {
                    return name + ".stream()\n" + "    .map(paramItemValue -> Objects.toString(paramItemValue, \"\"))\n"
                        + "    .collect(Collectors.joining(" + delimiter + "))";
                } else {
                    // Always use serializeIterable as Iterable supports both Iterable and List.

                    // this logic depends on rawType of proxy method parameter be List<WireType>
                    // alternative would be check wireType of client method parameter
                    IType elementWireType = parameter.getRawType() instanceof IterableType
                        ? ((IterableType) parameter.getRawType()).getElementType()
                        : elementType;

                    String serializeIterableInput = name;
                    if (elementWireType != elementType) {
                        // convert List<ClientType> to List<WireType>, if necessary
                        serializeIterableInput
                            = String.format("%s.stream().map(paramItemValue -> %s).collect(Collectors.toList())", name,
                                elementWireType.convertFromClientType("paramItemValue"));
                    }

                    // convert List<WireType> to String
                    return String.format(
                        "JacksonAdapter.createDefaultSerializerAdapter().serializeIterable(%s, CollectionFormat.%s)",
                        serializeIterableInput, parameter.getCollectionFormat().toString().toUpperCase(Locale.ROOT));
                }
            }
        } else {
            // primitive or date-time
            String conversionExpression = type.convertFromClientType(name);
            return String.format("String.valueOf(%s)", conversionExpression);
        }
    }

    private static String expressionConvertToType(String name, MethodParameter convenienceParameter, String mediaType) {
        if (convenienceParameter.getProxyMethodParameter() != null
            && convenienceParameter.getProxyMethodParameter().getRequestParameterLocation()
                == RequestParameterLocation.BODY) {
            IType bodyType = convenienceParameter.getProxyMethodParameter().getRawType();
            if (bodyType instanceof ClassType) {
                ClientModel model = ClientModelUtil.getClientModel(bodyType.toString());
                // serialize model for multipart/form-data
                if (model != null && ClientModelUtil.isMultipartModel(model)) {
                    return expressionMultipartFormDataToBinaryData(name, model);
                }
            }
            return expressionConvertToBinaryData(name, convenienceParameter.getClientMethodParameter().getWireType(),
                mediaType);
        } else {
            IType type = convenienceParameter.getClientMethodParameter().getWireType();
            if (type instanceof EnumType) {
                return expressionConvertToString(name, type, convenienceParameter.getProxyMethodParameter());
            } else if (type instanceof IterableType && ((IterableType) type).getElementType() instanceof EnumType) {
                IType enumType = ((IterableType) type).getElementType();
                IType enumValueType = ((EnumType) enumType).getElementType().asNullable();
                if (enumValueType == ClassType.STRING) {
                    return String.format(
                        "%1$s.stream().map(paramItemValue -> Objects.toString(paramItemValue, \"\")).collect(Collectors.toList())",
                        name);
                } else {
                    return String.format(
                        "%1$s.stream().map(paramItemValue -> paramItemValue == null ? \"\" : String.valueOf(paramItemValue.%2$s())).collect(Collectors.toList())",
                        name, ((EnumType) enumType).getToMethodName());
                }
            } else {
                return name;
            }
        }
    }

    private static String expressionMultipartFormDataToBinaryData(String name, ClientModel model) {
        BiFunction<String, String, String> nullableExpression
            = (propertyExpr, expr) -> propertyExpr + " == null ? null : " + expr;

        // serialize model for multipart/form-data
        StringBuilder builder = new StringBuilder().append("new MultipartFormDataHelper(requestOptions)");
        for (ClientModelProperty property : model.getProperties()) {
            String propertyGetExpression = name + "." + property.getGetterName() + "()";
            if (!property.isReadOnly()) {
                if (isMultipartModel(property.getWireType())) {
                    // file, usually application/octet-stream

                    String fileExpression = propertyGetExpression + ".getContent()";
                    String contentTypeExpression = propertyGetExpression + ".getContentType()";
                    String filenameExpression = propertyGetExpression + ".getFilename()";
                    if (!property.isRequired()) {
                        fileExpression = nullableExpression.apply(propertyGetExpression, fileExpression);
                        contentTypeExpression = nullableExpression.apply(propertyGetExpression, contentTypeExpression);
                        filenameExpression = nullableExpression.apply(propertyGetExpression, filenameExpression);
                    }

                    builder.append(String.format(".serializeFileField(%1$s, %2$s, %3$s, %4$s)",
                        ClassType.STRING.defaultValueExpression(property.getSerializedName()), fileExpression,
                        contentTypeExpression, filenameExpression));
                } else if (property.getWireType() instanceof IterableType
                    && isMultipartModel(((IterableType) property.getWireType()).getElementType())) {
                    // file array

                    // For now, we use 3 List, as we do not wish the Helper class refer to different ##FileDetails
                    // model.
                    // Later, if we switch to a shared class in azure-core, we can change the implementation.
                    String className = ((IterableType) property.getWireType()).getElementType().toString();
                    String streamExpressionFormat = "%1$s.stream().map(%2$s::%3$s).collect(Collectors.toList())";
                    String fileExpression
                        = String.format(streamExpressionFormat, propertyGetExpression, className, "getContent");
                    String contentTypeExpression
                        = String.format(streamExpressionFormat, propertyGetExpression, className, "getContentType");
                    String filenameExpression
                        = String.format(streamExpressionFormat, propertyGetExpression, className, "getFilename");
                    if (!property.isRequired()) {
                        fileExpression = nullableExpression.apply(propertyGetExpression, fileExpression);
                        contentTypeExpression = nullableExpression.apply(propertyGetExpression, contentTypeExpression);
                        filenameExpression = nullableExpression.apply(propertyGetExpression, filenameExpression);
                    }

                    builder.append(String.format(".serializeFileFields(%1$s, %2$s, %3$s, %4$s)",
                        ClassType.STRING.defaultValueExpression(property.getSerializedName()), fileExpression,
                        contentTypeExpression, filenameExpression));
                } else if (ClientModelUtil.isClientModel(property.getWireType())
                    || property.getWireType() instanceof MapType
                    || property.getWireType() instanceof IterableType) {
                    // application/json
                    builder.append(String.format(".serializeJsonField(%1$s, %2$s)",
                        ClassType.STRING.defaultValueExpression(property.getSerializedName()), propertyGetExpression));
                } else {
                    // text/plain
                    String stringExpression = propertyGetExpression;
                    // convert to String
                    if (property.getWireType() instanceof PrimitiveType) {
                        stringExpression = String.format("String.valueOf(%s)", stringExpression);
                    } else if (property.getWireType() != ClassType.STRING) {
                        stringExpression = String.format("Objects.toString(%s)", stringExpression);
                    }
                    builder.append(String.format(".serializeTextField(%1$s, %2$s)",
                        ClassType.STRING.defaultValueExpression(property.getSerializedName()), stringExpression));
                }
            }
        }
        builder.append(".end().getRequestBody()");
        return builder.toString();
    }

    private static boolean isMultipartModel(IType type) {
        if (ClientModelUtil.isClientModel(type)) {
            return ClientModelUtil.isMultipartModel(ClientModelUtil.getClientModel(type.toString()));
        } else {
            return false;
        }
    }

    private static Map<MethodParameter, MethodParameter>
        findParametersForConvenienceMethod(ClientMethod convenienceMethod, ClientMethod protocolMethod) {
        Map<MethodParameter, MethodParameter> parameterMap = new LinkedHashMap<>();
        List<MethodParameter> convenienceParameters = getParameters(convenienceMethod, true);
        Map<String, MethodParameter> clientParameters = getParameters(protocolMethod, false).stream()
            .collect(Collectors.toMap(key -> key.getSerializedName() == null ? key.getName() : key.getSerializedName(),
                Function.identity()));
        for (MethodParameter convenienceParameter : convenienceParameters) {
            String name = convenienceParameter.getSerializedName();
            parameterMap.put(convenienceParameter, clientParameters.get(name));
        }
        if (convenienceMethod.isPageStreamingType()) {
            final MethodPageDetails pageDetails = convenienceMethod.getMethodPageDetails();
            parameterMap.entrySet()
                .removeIf(it -> pageDetails.shouldHideParameter(it.getKey().getClientMethodParameter()));
        }
        return parameterMap;
    }

    private static MethodParameter findProtocolMethodParameterForConvenienceMethod(MethodParameter parameter,
        ClientMethod protocolMethod) {
        List<MethodParameter> protocolParameters = getParameters(protocolMethod, false);
        return protocolParameters.stream()
            .filter(p -> Objects.equals(parameter.getSerializedName(), p.getSerializedName()))
            .findFirst()
            .orElse(null);
    }

    private static List<MethodParameter> getParameters(ClientMethod method, boolean useAllParameters) {
        List<ProxyMethodParameter> proxyMethodParameters
            = useAllParameters ? method.getProxyMethod().getAllParameters() : method.getProxyMethod().getParameters();
        Map<String, ProxyMethodParameter> proxyMethodParameterByClientParameterName = proxyMethodParameters.stream()
            .collect(Collectors.toMap(p -> CodeNamer.getEscapedReservedClientMethodParameterName(p.getName()),
                Function.identity()));
        return method.getMethodInputParameters().stream().filter(p -> !p.isConstant() && !p.isFromClient()).map(p -> {
            ProxyMethodParameter proxyMethodParameter = proxyMethodParameterByClientParameterName.get(p.getName());
            if (proxyMethodParameter != null) {
                if (p.getRequestParameterLocation() != proxyMethodParameter.getRequestParameterLocation()) {
                    proxyMethodParameter = null;
                }
            }
            return new MethodParameter(proxyMethodParameter, p);
        }).collect(Collectors.toList());
    }

    /**
     * Writes the expression to convert a convenience parameter to a protocol parameter and wrap it in
     * JsonMergePatchHelper.
     * 
     * @param javaBlock
     * @param convenientParameterTypeName
     * @param convenientParameterName
     * @param expression
     * @return the name of the variable that holds the converted parameter
     */
    private static String writeParameterConversionExpressionWithJsonMergePatchEnabled(JavaBlock javaBlock,
        String convenientParameterTypeName, String convenientParameterName, String expression) {
        String variableName = convenientParameterName + "InBinaryData";
        javaBlock
            .line(String.format("JsonMergePatchHelper.get%1$sAccessor().prepareModelForJsonMergePatch(%2$s, true);",
                convenientParameterTypeName, convenientParameterName));
        javaBlock.line("BinaryData " + variableName + " = " + expression + ";");
        javaBlock
            .line("// BinaryData.fromObject() will not fire serialization, use getLength() to fire serialization.");
        javaBlock.line(variableName + ".getLength();");
        javaBlock
            .line(String.format("JsonMergePatchHelper.get%1$sAccessor().prepareModelForJsonMergePatch(%2$s, false);",
                convenientParameterTypeName, convenientParameterName));
        return variableName;
    }

    protected static class MethodParameter {

        private final ProxyMethodParameter proxyMethodParameter;
        private final ClientMethodParameter clientMethodParameter;

        public MethodParameter(ProxyMethodParameter proxyMethodParameter, ClientMethodParameter clientMethodParameter) {
            this.proxyMethodParameter = proxyMethodParameter;
            this.clientMethodParameter = clientMethodParameter;
        }

        public ProxyMethodParameter getProxyMethodParameter() {
            return proxyMethodParameter;
        }

        public ClientMethodParameter getClientMethodParameter() {
            return clientMethodParameter;
        }

        public String getName() {
            return this.getClientMethodParameter().getName();
        }

        public String getSerializedName() {
            if (this.getProxyMethodParameter() == null) {
                return null;
            } else {
                String name = this.getProxyMethodParameter().getRequestParameterName();
                if (name == null
                    && this.getProxyMethodParameter().getRequestParameterLocation() == RequestParameterLocation.BODY) {
                    name = "__internal_request_BODY";
                }
                return name;
            }
        }
    }
}
