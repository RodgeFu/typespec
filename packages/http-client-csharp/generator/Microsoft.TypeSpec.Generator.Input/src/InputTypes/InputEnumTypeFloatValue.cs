// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

namespace Microsoft.TypeSpec.Generator.Input
{
    internal class InputEnumTypeFloatValue : InputEnumTypeValue
    {
        public InputEnumTypeFloatValue(string name, float floatValue, InputPrimitiveType valueType, InputEnumType enumType, string? summary, string? doc) : base(name, floatValue, valueType, enumType, summary, doc)
        {
            FloatValue = floatValue;
        }

        public float FloatValue { get; }
    }
}
