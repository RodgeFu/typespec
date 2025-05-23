// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Collections;
using System.Collections.Generic;
using Microsoft.TypeSpec.Generator.Expressions;
using Microsoft.TypeSpec.Generator.Primitives;

namespace Microsoft.TypeSpec.Generator.Statements
{
    public sealed class UsingScopeStatement : MethodBodyStatement
    {
        public CSharpType? Type { get; }
        public CodeWriterDeclaration Variable { get; }
        public ValueExpression Value { get; }

        public UsingScopeStatement(CSharpType? type, CodeWriterDeclaration variable, ValueExpression value)
        {
            Type = type;
            Variable = variable;
            Value = value;
        }

        private readonly List<MethodBodyStatement> _body = new();
        public IReadOnlyList<MethodBodyStatement> Body => _body;

        public UsingScopeStatement(CSharpType type, string variableName, ValueExpression value, out VariableExpression variable) : this(type, new CodeWriterDeclaration(variableName), value)
        {
            variable = new VariableExpression(type, Variable);
        }

        public void Add(MethodBodyStatement statement) => _body.Add(statement);

        internal override void Write(CodeWriter writer)
        {
            using (writer.AmbientScope())
            {
                writer.AppendRaw("using (");
                if (Type == null)
                {
                    writer.AppendRaw("var ");
                }
                else
                {
                    writer.Append($"{Type} ");
                }

                writer.Append($"{Variable:D} = ");
                Value.Write(writer);
                writer.WriteRawLine(")");

                using (writer.ScopeRaw())
                {
                    foreach (var bodyStatement in Body)
                    {
                        bodyStatement.Write(writer);
                    }
                }
            }
        }
    }
}
