// <auto-generated/>

#nullable disable

using System;
using System.ClientModel;
using System.ClientModel.Primitives;
using System.Threading;
using System.Threading.Tasks;

namespace Authentication.Union
{
    public partial class UnionClient
    {
        protected UnionClient() => throw null;

        public UnionClient(ApiKeyCredential credential) : this(new Uri("http://localhost:3000"), credential, new UnionClientOptions()) => throw null;

        public UnionClient(AuthenticationTokenProvider tokenProvider) : this(new Uri("http://localhost:3000"), tokenProvider, new UnionClientOptions()) => throw null;

        public UnionClient(Uri endpoint, ApiKeyCredential credential, UnionClientOptions options) => throw null;

        public UnionClient(Uri endpoint, AuthenticationTokenProvider tokenProvider, UnionClientOptions options) => throw null;

        public ClientPipeline Pipeline => throw null;

        public virtual ClientResult ValidKey(RequestOptions options) => throw null;

        public virtual Task<ClientResult> ValidKeyAsync(RequestOptions options) => throw null;

        public virtual ClientResult ValidKey(CancellationToken cancellationToken = default) => throw null;

        public virtual Task<ClientResult> ValidKeyAsync(CancellationToken cancellationToken = default) => throw null;

        public virtual ClientResult ValidToken(RequestOptions options) => throw null;

        public virtual Task<ClientResult> ValidTokenAsync(RequestOptions options) => throw null;

        public virtual ClientResult ValidToken(CancellationToken cancellationToken = default) => throw null;

        public virtual Task<ClientResult> ValidTokenAsync(CancellationToken cancellationToken = default) => throw null;
    }
}
