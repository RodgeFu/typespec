// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

package type.property.valuetypes;

import java.util.Arrays;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import type.property.valuetypes.models.CollectionsStringProperty;

class CollectionsStringClientTest {

    CollectionsStringClient client = new ValueTypesClientBuilder().buildCollectionsStringClient();

    @Test
    void get() {
        CollectionsStringProperty collectionsStringProperty = client.get();
        Assertions.assertEquals("hello", collectionsStringProperty.getProperty().get(0));
        Assertions.assertEquals("world", collectionsStringProperty.getProperty().get(1));
    }

    @Test
    void put() {
        CollectionsStringProperty collectionsStringProperty
            = new CollectionsStringProperty(Arrays.asList("hello", "world"));
        client.put(collectionsStringProperty);
    }
}
