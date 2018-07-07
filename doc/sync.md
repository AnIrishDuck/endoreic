# Synchronization

Because this library is intended for use with mobile clients, operation when
disconnected from the server must not be impeded. This means that data must
still be available when disconnected, and writes must be locally cached for
eventual persistence.

As a result, when a client reconnects, synchronization must happen. For
immutable data streams, synchronization is easy. For action streams, a more
complex strategy is needed. To this end, the following background process is
constantly running in an infinite loop:

- a batch of new actions is fetched
- if no actions were fetched, we attempt to persist a batch of pending actions
- in a transaction:
  - any pending actions are unapplied in reverse order
  - the new actions are applied
  - all pending actions are applied in order
  - all persisted pending actions are resolved
- we pause before looping:
  - if a network failure happened above, a longer timeout (5s) is used
  - if no actions were fetched or persisted, a very long timeout (60s) is used,
    with a wake-up override for new actions from the client.
  - if any activity happened, no timeout occurs and we loop back immediately

# Conflicts

Pending actions can be applied to a state that is different than the state
seen when performing said actions. This can cause conflicts.

## Acts of Creation
There are some types of actions where conflicts are a priori impossible.
Consider object creation. Because each object has a UUID, the only possible
conflict would be another create with the same UUID. The nature of UUIDs should
prevent this from happening.

Further, updates to / removal of these newly created objects will refer to the
object UUID. Because none of the other clients will even be aware that these new
objects exist, their actions should not conflict.

## Acts on Extant Objects
Now, let's consider what happens if the user acts upon objects that existed
prior to the network split. In this case, it is possible that their actions can
"conflict" with actions recorded by another party. With the standard update /
remove actions, there are two possible conflicts for operations performed on the
same object:

- remove / update - resolved as if the actions occurred in the reverse order.
- remove / remove - effectively combined into the same operation

In both cases, the second conflicting operation is effectively discarded.

The third possible "conflict" is update / update. This is why it is critical to
only perform object updates on the keys that have changed. Even so, two users
can update the same key. In this case, the last update saved to the log "wins".

## Conflict-free Operation

It is possible to avoid conflicts altogether with some user restrictions. As
noted above, creation of objects and further updates / removals cannot conflict
with actions from other parties. Thus, zero-conflict operation can be enforced
by considering all existing objects read-only when the server is not available.

This results in additional complications. In particular, actions must be
extended with a form of object "locking" to prevent conflicts while a client is
synchronizing its created objects.

While this library partially enables the above mode via checks to `pending`
objects, it does not directly enforce this level of consistency yet.

# Concurrency and Consistency

While online, the server enforces [strict serializability] for each stream via
the index counter.

When offline, the client keeps local writes available in a [casually consistent]
fashion. Once the partitioned client reconnects to the server and syncs, all
clients will converge onto a combined state.

[strict serializability]: https://jepsen.io/consistency/models/strict-serializable
[casually consistent]: https://jepsen.io/consistency/models/causal
