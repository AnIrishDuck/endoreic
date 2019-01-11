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
import { decode, encode, BoxKeyPair, SecretKey } from './crypto'
import { authToken, authTokens } from './Server'
import _ from 'lodash'

export default class Keyring {
  static shard = 'keyring'

  constructor (server, id) {
    this.server = server
    this.id = id
  }

  index () {
    // OBLIVIOUS:
    // - id is an encoded public key
    return this.server.getIndex(this.id, Keyring.shard)
  }

  async current () {
    // OBLIVIOUS:
    // - id is an encoded public key
    // - index - 1 is an integer that can only communicate / validate
    //   stream position
    const index = await this.index()
    return {
      index,
      blob: await this.server.getEntry(this.id, Keyring.shard, index - 1),
    }
  }

  encrypt (target, keyring) {
    let keys = {
      read: encode(keyring.read.keyBuffer()),
      write: encode(keyring.write.secretKeyBuffer())
    }
    let blob = new Buffer(JSON.stringify(keys))
    return encode(keyring.write.encrypt(target.publicKey(), blob))
  }

  unlock (user, json) {
    const stash = json[user.publicKey()]
    if (_.isUndefined(stash)) { return }

    const raw = JSON.parse(user.decrypt(this.id, decode(stash)))

    return {
      id: json.id,
      read: new SecretKey(raw.read),
      write: new BoxKeyPair(raw.write)
    }
  }

  async fetch (user) {
    const { blob } = await this.current()
    return this.unlock(user, JSON.parse(blob))
  }

  async add (host, guest) {
    const prior = await this.current()
    const keyring = JSON.parse(prior.blob)
    const keys = this.unlock(host, keyring)
    const json = {
      ...keyring,
      [guest.publicKey()]: this.encrypt(guest, keys)
    }

    const next = new Buffer(JSON.stringify(json))

    // OBLIVIOUS:
    // - id is an encoded public key
    // - keyringBuffer is JSON from encryptedKeyring:
    //   - read is an encoded blob encrypted with write => access box
    //   - write is an encoded blob encrypted with write => access box
    // - see authToken()
    const token = { auth: authToken(keys.write) }
    await this.server.putEntry(this.id, Keyring.shard, prior.index, next, token)
  }

  static async create (server, owner) {
    const read = new SecretKey()
    const write = new BoxKeyPair()
    const id = write.publicKey()

    const keys = { read, write }
    const ring = new Keyring(server, id)
    const start = {
      id,
      [owner.publicKey()]: ring.encrypt(owner, keys)
    }
    const blob = new Buffer(JSON.stringify(start))

    // OBLIVIOUS:
    // - id is an encoded public key
    // - keyringBuffer is JSON from encryptedKeyring:
    //   - read is an encoded blob encrypted with write => access box
    //   - write is an encoded blob encrypted with write => access box
    // - see authTokens()
    const tokens = authTokens(write, owner)
    await server.putEntry(id, Keyring.shard, 0, blob, tokens)

    return ring
  }

  static lookup (server, id, guest) {
    const keyring = new Keyring(server, id)
    return keyring.fetch(guest)
  }
}
