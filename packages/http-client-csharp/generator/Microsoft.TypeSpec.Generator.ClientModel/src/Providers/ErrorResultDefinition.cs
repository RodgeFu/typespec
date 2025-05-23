// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.ClientModel;
using System.Collections.Generic;
using System.IO;
using Microsoft.TypeSpec.Generator.Expressions;
using Microsoft.TypeSpec.Generator.Primitives;
using Microsoft.TypeSpec.Generator.Providers;
using Microsoft.TypeSpec.Generator.Statements;
using static Microsoft.TypeSpec.Generator.Snippets.Snippet;

namespace Microsoft.TypeSpec.Generator.ClientModel.Providers
{
    internal class ErrorResultDefinition : TypeProvider
    {
        private class ErrorResultTemplate<T> { }

        private CSharpType _t = typeof(ErrorResultTemplate<>).GetGenericArguments()[0];
        private FieldProvider _responseField;
        private FieldProvider _exceptionField;
        private VariableExpression _response;
        private VariableExpression _exception;

        public ErrorResultDefinition()
        {
            _responseField = new FieldProvider(FieldModifiers.Private | FieldModifiers.ReadOnly, ScmCodeModelGenerator.Instance.TypeFactory.HttpResponseApi.HttpResponseType, "_response", this);
            _exceptionField = new FieldProvider(FieldModifiers.Private | FieldModifiers.ReadOnly, ScmCodeModelGenerator.Instance.TypeFactory.ClientResponseApi.ClientResponseExceptionType, "_exception", this);
            _response = new VariableExpression(_responseField.Type, _responseField.Declaration);
            _exception = new VariableExpression(_exceptionField.Type, _exceptionField.Declaration);
        }

        private bool IsClientResult => ScmCodeModelGenerator.Instance.TypeFactory.ClientResponseApi.ClientResponseOfTType.FrameworkType == typeof(ClientResult<>);

        protected override TypeSignatureModifiers BuildDeclarationModifiers()
        {
            return TypeSignatureModifiers.Internal;
        }

        protected override string BuildRelativeFilePath() => Path.Combine("src", "Generated", "Internal", $"{Name}.cs");

        protected override string BuildName() => "ErrorResult";

        protected override CSharpType[] GetTypeArguments()
        {
            return [_t];
        }

        protected override CSharpType[] BuildImplements()
        {
            return [new CSharpType(ScmCodeModelGenerator.Instance.TypeFactory.ClientResponseApi.ClientResponseOfTType.FrameworkType, _t)];
        }

        protected override FieldProvider[] BuildFields()
        {
            return [_responseField, _exceptionField];
        }

        protected override ConstructorProvider[] BuildConstructors()
        {
            return [BuildCtor()];
        }

        private ConstructorProvider BuildCtor()
        {
            var response = new ParameterProvider("response", FormattableStringHelpers.Empty, ScmCodeModelGenerator.Instance.TypeFactory.HttpResponseApi.HttpResponseType);
            var exception = new ParameterProvider("exception", FormattableStringHelpers.Empty, ScmCodeModelGenerator.Instance.TypeFactory.ClientResponseApi.ClientResponseExceptionType);
            var baseInitializer = IsClientResult
                ? new ConstructorInitializer(true, new List<ValueExpression> { Default, response })
                : new ConstructorInitializer(true, new List<ValueExpression>());
            var signature = new ConstructorSignature(Type, null, MethodSignatureModifiers.Public, [response, exception], Initializer: baseInitializer);
            return new ConstructorProvider(signature, new MethodBodyStatement[]
            {
                _response.Assign(response).Terminate(),
                _exception.Assign(exception).Terminate(),
            }, this, XmlDocProvider.Empty);
        }

        protected override PropertyProvider[] BuildProperties()
        {
            return [BuildValue()];
        }

        private PropertyProvider BuildValue()
        {
            return new PropertyProvider(null, MethodSignatureModifiers.Public | MethodSignatureModifiers.Override, _t, "Value", new ExpressionPropertyBody(
                ThrowExpression(_exception)),
                this);
        }

        protected override MethodProvider[] BuildMethods()
        {
            return IsClientResult ? [] : [BuildGetRawResponse()];
        }

        private MethodProvider BuildGetRawResponse()
        {
            var signature = new MethodSignature(
                "GetRawResponse",
                FormattableStringHelpers.Empty,
                MethodSignatureModifiers.Public | MethodSignatureModifiers.Override,
                ScmCodeModelGenerator.Instance.TypeFactory.HttpResponseApi.HttpResponseType,
                null,
                []
            );
            return new MethodProvider(signature, new MethodBodyStatement[]
            {
                Return(_response)
            }, this);
        }
    }
}
