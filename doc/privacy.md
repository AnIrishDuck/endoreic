# Privacy

The cloud this library interacts with is "content-blind". It cannot read the
decrypted contents of any uploaded data. It is oblivious to the data the user
stores on their end devices.

To encrypt all data, a root key and a variety of sub-keys generated and stored
locally. The private root key, and any derived private keys, are *NEVER* sent to
the server in cleartext.  

All data sent to the server is either encrypted or trivial metadata required to
ensure authorization and consistency of data storage.

## Cryptographic Dependencies

We do not roll our own crypto. All cryptographic operations are done using
[some helper classes][1] that wrap `tweetnacl`.

Key derivation is performed using `scrypt` with [sensible parameters][2]

[1]: lib/crypto.js
[2]: lib/crypto.js#L27

## Server Interactions

Here's a list of all data that the cloud can receive:

- authorization tokens (encrypted timestamps) to verify the user
- hardcoded strings used to separate the data of different kinds of applications
- base64 encoded public keys, derived from local key pairs that were generated
  using a cryptographically secure RNG.
- data stored in a NaCL `SecretBox`, encrypted from local keys
- data stream indices to verify that we have fetched all remote server data
  before uploading new actions

Again, note that no cleartext private keys and no other plaintext user data are
ever sent to the cloud.

We want to make this claim easily audit-able.

All references to a `Server` in code are either a `server` instance variable or
a `server` local variable. Every interaction with the server has a `OBLIVIOUS`
documentation comment describing what data is being sent.

## Key Derivation

We strongly recommend using a library like [bip39][3] to derive the root
password. We take this root password, and [run it through scrypt][4] to derive
the root `SecretBox` keypair.

From here, we generate "access keys" for individual applications, encrypt those
with the root password, and send them to the cloud. Those "access keys" are
[used][5] to encrypt "store keys" which are also sent to the cloud.

The "store keys" are what encrypt the action / blob data sent to the server.

The [`User`](lib/user.js) class is where all key derivation happens. It has
documentation comments with more details.

At some point, we will add features enabling users to share store data with
other users. This will require creation / sharing of access keys for the data
stores. We will make this functionality as limited as possible so that any
downstream applications that use data sharing can also be audited.  

[3]: https://github.com/bitcoinjs/bip39/
[4]: lib/crypto.js#L27
[5]: lib/user.js

## Metadata Analysis

We attempt to store as little metadata / logging information in the cloud as
possible. That said, someone with backdoor access to our public cloud could
probably determine the following:

- What applications (i.e. finance, passwords, photos, etc) someone uses
- When a user has done "something" in a specific application
- IP addresses, client device types, other general client data necessary to make
  a HTTP connection to our cloud.

We again want to emphasize that an attacker with backdoor access *cannot* get
any stored data. Financial transactions, passwords, photographs, etc will be
safely encrypted, and private.
