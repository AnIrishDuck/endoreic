The network protocol is designed to be as simple as possible, so community
members can easily run their own private server if they so desire.

Every "write" to the server is achieved via a "stream". To prevent malicious
third parties from inserting garbage into the stream, all writes are
authenticated. The stream identifier is the encoded public key of the write key.
Authentication is achieved by encrypting a token (the current time) with the
stream's private key.

The server enforces stream consistency by verifying that all stream clients have
processed all prior stream values prior to a write. It does this using a "stream
sequence number" which the client must provide with every write, indicating the
last element in the stream that the client has processed.

Naturally, this sequence number must be greater than all prior sequence numbers
on the server for the write to succeed.

The "main" community server (caspian.talaria.cloud) is also responsible for
user key / quota management. It allows the user to create / update a public key
which it uses to track how many blocks a user has stored for billing purposes.
