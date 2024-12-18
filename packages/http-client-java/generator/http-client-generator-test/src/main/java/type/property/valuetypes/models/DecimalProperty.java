// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
// Code generated by Microsoft (R) TypeSpec Code Generator.

package type.property.valuetypes.models;

import com.azure.core.annotation.Generated;
import com.azure.core.annotation.Immutable;
import com.azure.json.JsonReader;
import com.azure.json.JsonSerializable;
import com.azure.json.JsonToken;
import com.azure.json.JsonWriter;
import java.io.IOException;
import java.math.BigDecimal;

/**
 * Model with a decimal property.
 */
@Immutable
public final class DecimalProperty implements JsonSerializable<DecimalProperty> {
    /*
     * Property
     */
    @Generated
    private final BigDecimal property;

    /**
     * Creates an instance of DecimalProperty class.
     * 
     * @param property the property value to set.
     */
    @Generated
    public DecimalProperty(BigDecimal property) {
        this.property = property;
    }

    /**
     * Get the property property: Property.
     * 
     * @return the property value.
     */
    @Generated
    public BigDecimal getProperty() {
        return this.property;
    }

    /**
     * {@inheritDoc}
     */
    @Generated
    @Override
    public JsonWriter toJson(JsonWriter jsonWriter) throws IOException {
        jsonWriter.writeStartObject();
        jsonWriter.writeNumberField("property", this.property);
        return jsonWriter.writeEndObject();
    }

    /**
     * Reads an instance of DecimalProperty from the JsonReader.
     * 
     * @param jsonReader The JsonReader being read.
     * @return An instance of DecimalProperty if the JsonReader was pointing to an instance of it, or null if it was
     * pointing to JSON null.
     * @throws IllegalStateException If the deserialized JSON object was missing any required properties.
     * @throws IOException If an error occurs while reading the DecimalProperty.
     */
    @Generated
    public static DecimalProperty fromJson(JsonReader jsonReader) throws IOException {
        return jsonReader.readObject(reader -> {
            BigDecimal property = null;
            while (reader.nextToken() != JsonToken.END_OBJECT) {
                String fieldName = reader.getFieldName();
                reader.nextToken();

                if ("property".equals(fieldName)) {
                    property = reader.getNullable(nonNullReader -> new BigDecimal(nonNullReader.getString()));
                } else {
                    reader.skipChildren();
                }
            }
            return new DecimalProperty(property);
        });
    }
}
