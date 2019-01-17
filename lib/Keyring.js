/*
 * NOTE: we use sender => receiver here to denote a NaCL box operation
 *
 * Keyrings are used to control access to streams of data. They allow users
 * to share access to a given data store with other "guests". With write access,
 * a "guest" can grant access to additional guests.
 *
 * Keyrings are implemented as a map of public keys to blobs containing two
 * encrypted keys. The read key is used to decrypt blobs in the data stream. The
 * write key allows a guest to post new entries to the server.
 *
 * Every entry is encrypted with [stream key => guest key]. A guest can retrieve
 * their keys by looking up the blob stored at their public key and then
 * decrypting it.
 *
 * Key revocation would be best implemented with explicit rekeying of all future
 * entries in the data stream. This is not currently implemented.
 */
import { decode, encode, BoxKeyPair, SecretKey, SignKeyPair } from './crypto'
import _ from 'lodash'

export default class Keyring {
  static shard = 'keyring'

  constructor (server, key) {
    this.server = server
    this.key = key
  }

  index () {
    // OBLIVIOUS:
    return this.server.getIndex(this.key, Keyring.shard)
  }

  async current () {
    const index = await this.index()
    return {
      index,
      // OBLIVIOUS:
      blob: await this.server.getEntry(this.key, Keyring.shard, index - 1),
    }
  }

  encrypt (target, keyring) {
    let keys = {
      read: keyring.read.key(),
      write: keyring.write.seed()
    }
    let blob = new Buffer(JSON.stringify(keys))
    const write = new BoxKeyPair(keyring.read.key())
    return encode(write.encrypt(target, blob))
  }

  unlock (user, json) {
    const { readPublicKey } = json
    const stash = json[user.publicKey()]
    if (_.isUndefined(stash)) { return }

    const raw = JSON.parse(user.decrypt(readPublicKey, decode(stash)))

    return {
      read: new SecretKey(raw.read),
      write: new SignKeyPair(raw.write)
    }
  }

  async fetch (readKey) {
    const { blob } = await this.current()
    return this.unlock(readKey, JSON.parse(blob))
  }

  async add (host, guestPublicKey) {
    const prior = await this.current()
    const keyring = JSON.parse(prior.blob)
    const keys = this.unlock(host.read, keyring)
    const json = {
      ...keyring,
      [guestPublicKey]: this.encrypt(guestPublicKey, keys)
    }

    const next = new Buffer(JSON.stringify(json))

    // OBLIVIOUS:
    // - all elements in next are either public keys or encrypted (via induction)
    await this.server.putEntry(keys.write, Keyring.shard, prior.index, next)
  }

  static async create (server, owner) {
    const read = new SecretKey()
    const readKeyring = new BoxKeyPair(read.key())
    const write = new SignKeyPair()

    const keys = { read, write }
    const ring = new Keyring(server, write)
    const start = {
      readPublicKey: readKeyring.publicKey(),
      [owner.read.publicKey()]: ring.encrypt(owner.read.publicKey(), keys)
    }
    const blob = new Buffer(JSON.stringify(start))

    // OBLIVIOUS:
    // - all elements in blob are either public keys or encrypted
    await server.create(owner.write, write, Keyring.shard)
    await server.putEntry(write, Keyring.shard, 0, blob)

    return ring
  }

  static lookup (server, id, guest) {
    const keyring = new Keyring(server, id)
    return keyring.fetch(guest)
  }
}
