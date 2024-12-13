// <auto-generated/>

#nullable disable

using System;
using System.ClientModel;
using System.ClientModel.Primitives;
using System.Threading;
using System.Threading.Tasks;

namespace Authentication.ApiKey
{
    public partial class ApiKeyClient
    {
        protected ApiKeyClient() => throw null;

        public ApiKeyClient(ApiKeyCredential keyCredential) : this(new Uri("http://localhost:3000"), keyCredential, new ApiKeyClientOptions()) => throw null;

        public ApiKeyClient(Uri endpoint, ApiKeyCredential keyCredential, ApiKeyClientOptions options) => throw null;

        public ClientPipeline Pipeline => throw null;

        public virtual ClientResult Valid(RequestOptions options) => throw null;

        public virtual Task<ClientResult> ValidAsync(RequestOptions options) => throw null;

        public virtual ClientResult Valid(CancellationToken cancellationToken = default) => throw null;

        public virtual Task<ClientResult> ValidAsync(CancellationToken cancellationToken = default) => throw null;

        public virtual ClientResult Invalid(RequestOptions options) => throw null;

        public virtual Task<ClientResult> InvalidAsync(RequestOptions options) => throw null;

        public virtual ClientResult Invalid(CancellationToken cancellationToken = default) => throw null;

        public virtual Task<ClientResult> InvalidAsync(CancellationToken cancellationToken = default) => throw null;
    }
}
