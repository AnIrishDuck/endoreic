# endoreic

A library for building salty basins of data. Uses a
[lightly wrapped](lib/crypto.js) [tweetnacl][2] for all
cryptographic operations. Inspired by ActiveRecord, Redux,
and the [event sourcing][1] architectural pattern. Designed to be used inside
React applications.

[1]: https://martinfowler.com/eaaDev/EventSourcing.html
[2]: https://tweetnacl.js.org/

# Architecture

Application logic for data streams can built out of the `Store` / `Model`
objects. Common create / update / removal actions can be built using `cru`.

The `Store` is built around a local object and datastream cache. This cache is
persistent and stored in sqlite.

See the test [fixtures](test/fixtures) for an example application.
