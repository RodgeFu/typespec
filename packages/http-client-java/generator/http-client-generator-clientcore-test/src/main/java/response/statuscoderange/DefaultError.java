package response.statuscoderange;

import io.clientcore.core.annotations.Metadata;
import io.clientcore.core.annotations.MetadataProperties;
import io.clientcore.core.serialization.json.JsonReader;
import io.clientcore.core.serialization.json.JsonSerializable;
import io.clientcore.core.serialization.json.JsonToken;
import io.clientcore.core.serialization.json.JsonWriter;
import java.io.IOException;

/**
 * The DefaultError model.
 */
@Metadata(properties = { MetadataProperties.IMMUTABLE })
public final class DefaultError implements JsonSerializable<DefaultError> {
    /*
     * The code property.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private final String code;

    /**
     * Creates an instance of DefaultError class.
     * 
     * @param code the code value to set.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    private DefaultError(String code) {
        this.code = code;
    }

    /**
     * Get the code property: The code property.
     * 
     * @return the code value.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public String getCode() {
        return this.code;
    }

    /**
     * {@inheritDoc}
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    @Override
    public JsonWriter toJson(JsonWriter jsonWriter) throws IOException {
        jsonWriter.writeStartObject();
        jsonWriter.writeStringField("code", this.code);
        return jsonWriter.writeEndObject();
    }

    /**
     * Reads an instance of DefaultError from the JsonReader.
     * 
     * @param jsonReader The JsonReader being read.
     * @return An instance of DefaultError if the JsonReader was pointing to an instance of it, or null if it was
     * pointing to JSON null.
     * @throws IllegalStateException If the deserialized JSON object was missing any required properties.
     * @throws IOException If an error occurs while reading the DefaultError.
     */
    @Metadata(properties = { MetadataProperties.GENERATED })
    public static DefaultError fromJson(JsonReader jsonReader) throws IOException {
        return jsonReader.readObject(reader -> {
            String code = null;
            while (reader.nextToken() != JsonToken.END_OBJECT) {
                String fieldName = reader.getFieldName();
                reader.nextToken();

                if ("code".equals(fieldName)) {
                    code = reader.getString();
                } else {
                    reader.skipChildren();
                }
            }
            return new DefaultError(code);
        });
    }
}
