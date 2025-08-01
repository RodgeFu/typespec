// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
// Code generated by Microsoft (R) TypeSpec Code Generator.

package azure.clientgenerator.core.clientlocation.implementation;

import com.azure.core.annotation.ExpectedResponses;
import com.azure.core.annotation.Get;
import com.azure.core.annotation.Host;
import com.azure.core.annotation.HostParam;
import com.azure.core.annotation.ReturnType;
import com.azure.core.annotation.ServiceInterface;
import com.azure.core.annotation.ServiceMethod;
import com.azure.core.annotation.UnexpectedResponseExceptionType;
import com.azure.core.exception.ClientAuthenticationException;
import com.azure.core.exception.HttpResponseException;
import com.azure.core.exception.ResourceModifiedException;
import com.azure.core.exception.ResourceNotFoundException;
import com.azure.core.http.HttpPipeline;
import com.azure.core.http.HttpPipelineBuilder;
import com.azure.core.http.policy.RetryPolicy;
import com.azure.core.http.policy.UserAgentPolicy;
import com.azure.core.http.rest.RequestOptions;
import com.azure.core.http.rest.Response;
import com.azure.core.http.rest.RestProxy;
import com.azure.core.util.Context;
import com.azure.core.util.FluxUtil;
import com.azure.core.util.serializer.JacksonAdapter;
import com.azure.core.util.serializer.SerializerAdapter;
import reactor.core.publisher.Mono;

/**
 * Initializes a new instance of the ClientLocationClient type.
 */
public final class ClientLocationClientImpl {
    /**
     * The proxy service used to perform REST calls.
     */
    private final ClientLocationClientService service;

    /**
     * Service host.
     */
    private final String endpoint;

    /**
     * Gets Service host.
     * 
     * @return the endpoint value.
     */
    public String getEndpoint() {
        return this.endpoint;
    }

    /**
     * The HTTP pipeline to send requests through.
     */
    private final HttpPipeline httpPipeline;

    /**
     * Gets The HTTP pipeline to send requests through.
     * 
     * @return the httpPipeline value.
     */
    public HttpPipeline getHttpPipeline() {
        return this.httpPipeline;
    }

    /**
     * The serializer to serialize an object into a string.
     */
    private final SerializerAdapter serializerAdapter;

    /**
     * Gets The serializer to serialize an object into a string.
     * 
     * @return the serializerAdapter value.
     */
    public SerializerAdapter getSerializerAdapter() {
        return this.serializerAdapter;
    }

    /**
     * The MoveToExistingSubAdminOperationsImpl object to access its operations.
     */
    private final MoveToExistingSubAdminOperationsImpl moveToExistingSubAdminOperations;

    /**
     * Gets the MoveToExistingSubAdminOperationsImpl object to access its operations.
     * 
     * @return the MoveToExistingSubAdminOperationsImpl object.
     */
    public MoveToExistingSubAdminOperationsImpl getMoveToExistingSubAdminOperations() {
        return this.moveToExistingSubAdminOperations;
    }

    /**
     * The MoveToExistingSubUserOperationsImpl object to access its operations.
     */
    private final MoveToExistingSubUserOperationsImpl moveToExistingSubUserOperations;

    /**
     * Gets the MoveToExistingSubUserOperationsImpl object to access its operations.
     * 
     * @return the MoveToExistingSubUserOperationsImpl object.
     */
    public MoveToExistingSubUserOperationsImpl getMoveToExistingSubUserOperations() {
        return this.moveToExistingSubUserOperations;
    }

    /**
     * The MoveToNewSubProductOperationsImpl object to access its operations.
     */
    private final MoveToNewSubProductOperationsImpl moveToNewSubProductOperations;

    /**
     * Gets the MoveToNewSubProductOperationsImpl object to access its operations.
     * 
     * @return the MoveToNewSubProductOperationsImpl object.
     */
    public MoveToNewSubProductOperationsImpl getMoveToNewSubProductOperations() {
        return this.moveToNewSubProductOperations;
    }

    /**
     * The MoveToRootResourceOperationsImpl object to access its operations.
     */
    private final MoveToRootResourceOperationsImpl moveToRootResourceOperations;

    /**
     * Gets the MoveToRootResourceOperationsImpl object to access its operations.
     * 
     * @return the MoveToRootResourceOperationsImpl object.
     */
    public MoveToRootResourceOperationsImpl getMoveToRootResourceOperations() {
        return this.moveToRootResourceOperations;
    }

    /**
     * The ArchiveOperationsImpl object to access its operations.
     */
    private final ArchiveOperationsImpl archiveOperations;

    /**
     * Gets the ArchiveOperationsImpl object to access its operations.
     * 
     * @return the ArchiveOperationsImpl object.
     */
    public ArchiveOperationsImpl getArchiveOperations() {
        return this.archiveOperations;
    }

    /**
     * Initializes an instance of ClientLocationClient client.
     * 
     * @param endpoint Service host.
     */
    public ClientLocationClientImpl(String endpoint) {
        this(new HttpPipelineBuilder().policies(new UserAgentPolicy(), new RetryPolicy()).build(),
            JacksonAdapter.createDefaultSerializerAdapter(), endpoint);
    }

    /**
     * Initializes an instance of ClientLocationClient client.
     * 
     * @param httpPipeline The HTTP pipeline to send requests through.
     * @param endpoint Service host.
     */
    public ClientLocationClientImpl(HttpPipeline httpPipeline, String endpoint) {
        this(httpPipeline, JacksonAdapter.createDefaultSerializerAdapter(), endpoint);
    }

    /**
     * Initializes an instance of ClientLocationClient client.
     * 
     * @param httpPipeline The HTTP pipeline to send requests through.
     * @param serializerAdapter The serializer to serialize an object into a string.
     * @param endpoint Service host.
     */
    public ClientLocationClientImpl(HttpPipeline httpPipeline, SerializerAdapter serializerAdapter, String endpoint) {
        this.httpPipeline = httpPipeline;
        this.serializerAdapter = serializerAdapter;
        this.endpoint = endpoint;
        this.moveToExistingSubAdminOperations = new MoveToExistingSubAdminOperationsImpl(this);
        this.moveToExistingSubUserOperations = new MoveToExistingSubUserOperationsImpl(this);
        this.moveToNewSubProductOperations = new MoveToNewSubProductOperationsImpl(this);
        this.moveToRootResourceOperations = new MoveToRootResourceOperationsImpl(this);
        this.archiveOperations = new ArchiveOperationsImpl(this);
        this.service
            = RestProxy.create(ClientLocationClientService.class, this.httpPipeline, this.getSerializerAdapter());
    }

    /**
     * The interface defining all the services for ClientLocationClient to be used by the proxy service to perform REST
     * calls.
     */
    @Host("{endpoint}")
    @ServiceInterface(name = "ClientLocationClient")
    public interface ClientLocationClientService {
        @Get("/azure/client-generator-core/client-location/health")
        @ExpectedResponses({ 204 })
        @UnexpectedResponseExceptionType(value = ClientAuthenticationException.class, code = { 401 })
        @UnexpectedResponseExceptionType(value = ResourceNotFoundException.class, code = { 404 })
        @UnexpectedResponseExceptionType(value = ResourceModifiedException.class, code = { 409 })
        @UnexpectedResponseExceptionType(HttpResponseException.class)
        Mono<Response<Void>> getHealthStatus(@HostParam("endpoint") String endpoint, RequestOptions requestOptions,
            Context context);

        @Get("/azure/client-generator-core/client-location/health")
        @ExpectedResponses({ 204 })
        @UnexpectedResponseExceptionType(value = ClientAuthenticationException.class, code = { 401 })
        @UnexpectedResponseExceptionType(value = ResourceNotFoundException.class, code = { 404 })
        @UnexpectedResponseExceptionType(value = ResourceModifiedException.class, code = { 409 })
        @UnexpectedResponseExceptionType(HttpResponseException.class)
        Response<Void> getHealthStatusSync(@HostParam("endpoint") String endpoint, RequestOptions requestOptions,
            Context context);
    }

    /**
     * The getHealthStatus operation.
     * 
     * @param requestOptions The options to configure the HTTP request before HTTP client sends it.
     * @throws HttpResponseException thrown if the request is rejected by server.
     * @throws ClientAuthenticationException thrown if the request is rejected by server on status code 401.
     * @throws ResourceNotFoundException thrown if the request is rejected by server on status code 404.
     * @throws ResourceModifiedException thrown if the request is rejected by server on status code 409.
     * @return the {@link Response} on successful completion of {@link Mono}.
     */
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Mono<Response<Void>> getHealthStatusWithResponseAsync(RequestOptions requestOptions) {
        return FluxUtil.withContext(context -> service.getHealthStatus(this.getEndpoint(), requestOptions, context));
    }

    /**
     * The getHealthStatus operation.
     * 
     * @param requestOptions The options to configure the HTTP request before HTTP client sends it.
     * @throws HttpResponseException thrown if the request is rejected by server.
     * @throws ClientAuthenticationException thrown if the request is rejected by server on status code 401.
     * @throws ResourceNotFoundException thrown if the request is rejected by server on status code 404.
     * @throws ResourceModifiedException thrown if the request is rejected by server on status code 409.
     * @return the {@link Response}.
     */
    @ServiceMethod(returns = ReturnType.SINGLE)
    public Response<Void> getHealthStatusWithResponse(RequestOptions requestOptions) {
        return service.getHealthStatusSync(this.getEndpoint(), requestOptions, Context.NONE);
    }
}
