// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.ClientModel.Primitives;
using Microsoft.Generator.CSharp.Providers;
using Microsoft.Generator.CSharp.Snippets;
using Microsoft.Generator.CSharp.Statements;

namespace Microsoft.Generator.CSharp.ClientModel.Snippets
{
    internal partial class SystemExtensibleSnippets
    {
        internal class SystemModelSnippets : ModelSnippets
        {
            public override MethodProvider BuildFromOperationResponseMethod(TypeProvider typeProvider, MethodSignatureModifiers modifiers)
            {
                var result = new ParameterProvider("response", $"The result to deserialize the model from.", typeof(PipelineResponse));
                return new MethodProvider(
                    new MethodSignature(FromResponseName, $"Deserializes the model from a raw response.", modifiers, typeProvider.Type, null, new[] { result }),
                    new MethodBodyStatement[]
                    {
                        SystemSnippet.UsingVar("document", JsonDocumentSnippet.Parse(new PipelineResponseSnippet(result).Content), out var document),
                        Snippet.Return(TypeProviderSnippet.Deserialize(typeProvider, document.RootElement))
                    },
                    typeProvider);
            }
        }
    }
}
