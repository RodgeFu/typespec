// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

package type.array;

import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

class Float32ValueClientTest {

    Float32ValueClient client = new ArrayClientBuilder().buildFloat32ValueClient();

    @Test
    void get() {
        List<Double> response = client.get();
        Assertions.assertEquals(1, response.size());
        Assertions.assertEquals(43.125, response.get(0));
    }

    @Test
    void put() {
        client.put(Arrays.asList(43.125));
    }
}
