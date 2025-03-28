// <auto-generated/>

#nullable disable

using System;
using System.ClientModel;
using System.ClientModel.Primitives;
using System.Threading;
using System.Threading.Tasks;

namespace _Type.Model.Inheritance.NotDiscriminated
{
    public partial class NotDiscriminatedClient
    {
        public NotDiscriminatedClient() : this(new Uri("http://localhost:3000"), new NotDiscriminatedClientOptions()) => throw null;

        public NotDiscriminatedClient(Uri endpoint, NotDiscriminatedClientOptions options) => throw null;

        public ClientPipeline Pipeline => throw null;

        public virtual ClientResult PostValid(BinaryContent content, RequestOptions options = null) => throw null;

        public virtual Task<ClientResult> PostValidAsync(BinaryContent content, RequestOptions options = null) => throw null;

        public virtual ClientResult PostValid(Siamese input, CancellationToken cancellationToken = default) => throw null;

        public virtual Task<ClientResult> PostValidAsync(Siamese input, CancellationToken cancellationToken = default) => throw null;

        public virtual ClientResult GetValid(RequestOptions options) => throw null;

        public virtual Task<ClientResult> GetValidAsync(RequestOptions options) => throw null;

        public virtual ClientResult<Siamese> GetValid(CancellationToken cancellationToken = default) => throw null;

        public virtual Task<ClientResult<Siamese>> GetValidAsync(CancellationToken cancellationToken = default) => throw null;

        public virtual ClientResult PutValid(BinaryContent content, RequestOptions options = null) => throw null;

        public virtual Task<ClientResult> PutValidAsync(BinaryContent content, RequestOptions options = null) => throw null;

        public virtual ClientResult<Siamese> PutValid(Siamese input, CancellationToken cancellationToken = default) => throw null;

        public virtual Task<ClientResult<Siamese>> PutValidAsync(Siamese input, CancellationToken cancellationToken = default) => throw null;
    }
}
