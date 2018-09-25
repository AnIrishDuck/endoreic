# Overview

Broadly speaking, this library sacrifices the "C" in CAP. When offline, node
state can diverge. This is what enables offline reads / writes on mobile
clients. Once fully reconnected, the system will always converge to a
fully consistent state.

This consistency model is sufficient for the data this library was designed to
store (simple CRUD-ish data without the D). Simple register creations and
updates are easy to re-linearize in an (usually) unsurprising fashion.

**This model is not a good fit for applications that require complex atomic
commits**. This library is adaptable to those circumstances (See [Conflict-free
Operation]). However, that adaptation would require further development of a
complementary mode that sacrifices the "A" in CAP.

# Synchronization

This library is intended for use with mobile clients. These clients must still
be functional if they cannot connect to the server. This means that data must
still be available when disconnected, and writes must be locally cached for
eventual persistence.

As a result, when a client reconnects, synchronization must happen. For
immutable data blobs, synchronization is easy. For action streams, we currently
employ a last-write-wins policy on updates. Deletes can be simulated using a
["tombstone"] similar to other distributed systems like Cassandra.

The normal operation of synchronization on each client looks like this:

Here's an overview of the synchronization process:

- a batch of new actions is fetched
- if no actions were fetched, we attempt to persist a batch of pending actions
- in a transaction:
  - any pending actions are unapplied in reverse order
  - the new actions are applied
  - all pending actions are applied in order
  - all persisted pending actions are resolved

We recommend pausing before calling sync() again:
  - if a network failure happened above, a longer timeout (5s) should be used
  - if no actions were fetched or persisted, a very long timeout (60s) should be
    used, with a wake-up override for new actions from the client.
  - if any new actions were downloaded, no timeout should occurs and sync()
    should be called again immediately.

["tombstone"]: https://docs.datastax.com/en/cassandra/3.0/cassandra/dml/dmlAboutDeletes.html

# Conflicts

Pending actions can be applied to a state that is different than the state
seen when performing said actions. This can cause conflicts.

## Acts of Creation
There are some types of actions where conflicts are a priori impossible.
Consider object creation. Because each object has a UUID, the only possible
conflict would be another create with the same UUID. The nature of UUIDs should
prevent this from happening.

Further, updates to these newly created objects will refer to the object UUID.
Because none of the other clients will even be aware that these new objects
exist, their actions should not conflict.

## Acts on Extant Objects

The last-write-win policy can cause some potential weirdness, that increases as
the application grows in complexity. Complex actions might fail. "Dirty writes"
can happen.

At some point, this library will support "rebasing" actions to handle these
kinds of issues. For the moment, it does not.

We attempt to avoid write / write conflicts by performing object updates on the
keys that have changed. Even so, two users can update the same key. We hope to
address this further in the future. One possible strategy is laid out below.

## Conflict-free Operation

It is possible to avoid conflicts altogether with some user restrictions. As
noted above, creation of objects and further updates cannot conflict with
actions from other parties. Thus, zero-conflict operation can be enforced by
considering all existing objects read-only when the server is not available.

This results in additional complications. In particular, actions must be
extended with a form of object "locking" to prevent conflicts while a client is
synchronizing its created objects.

# Concurrency and Consistency

While online, the server enforces [strict serializability] for each stream via
the index counter.

When offline, the client keeps local writes available in a [casually consistent]
fashion. Once the partitioned client reconnects to the server and syncs, all
clients will converge onto a combined state that is consistent everywhere.

[strict serializability]: https://jepsen.io/consistency/models/strict-serializable
[casually consistent]: https://jepsen.io/consistency/models/causal
