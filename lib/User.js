/*
 * NOTE: we use sender => receiver here to denote a NaCL box operation
 *
 * A user can have many different stores for different applications like
 * location tracking, passwords, finance, photos, etc.
 *
 * A keyring is used to control access to streams of data. There are two kinds
 * of keyrings: user keyrings and store keyrings.
 *
 * User access to store streams is controlled via "access keys". Access keys
 * enable a many-to-many relationship between users and streams. They are
 * designed to allow a future "capability" system for the following scenarios:
 * - a user can grant read-only access to a given stream to another user
 * - a user can remove a read / write entry from a stream keyring, cutting off
 *   access for the other user that previously used that access key
 * - a user can change their account password without having to rekey all their
 *   data streams
 *
 * The user keyring is a mapping of store types to access keys. Each
 * access key is encrypted using {user => user}. Only someone with
 * the user private key can decrypt the access key.
 *
 * The access keys are then used to encrypt a given store's keyring. The store
 * keyring is indexed by access public key. Each entry is a dictionary of read /
 * write keys, encrypted using write => access. Only the write / access private
 * keys can be used to decrypt either key entry.
 */
import * as cru from './cru'
import { BoxKeyPair } from './crypto'
import { authTokens } from './Server'
import Keyring from './Keyring'
import Model from './Model'
import Store from './Store'
import * as types from './types'

export class Link extends Model {
  static kind = 'links'

  static shape = types.Row({
    storeId: types.String,
    shard: types.String,
    name: types.String,
    key: types.String
  })

  static actions = cru.actions(Link)
}

export class Application {
  constructor (user, Store) {
    this.user = user
    this.Store = Store
  }

  async create (name) {
    const { db, server } = this.user
    const key = new BoxKeyPair()
    const keyring = await Keyring.create(server, key)
    const keys = await keyring.fetch(key)

    await this.user.links.create([{
      storeId: keys.id,
      shard: this.Store.shard,
      name,
      key: key.secretKey()
    }])

    return this.Store.create(db, server, keys)
  }

  list () {
    const all = this.user.links.where({ shard: this.Store.shard })
    return all.fetch()
  }

  async get (storeId) {
    const { shard } = this.Store
    const { db, server } = this.user
    const [ entry ] = await this.user.links.where({ storeId, shard }).fetch()

    const key = new BoxKeyPair(entry.key)
    const keys = await Keyring.lookup(server, entry.storeId, key)
    return this.Store.create(db, server, keys)
  }
}

export default class User extends Store {
  static shard = 'user'
  static models = [Link]
  static create = Store.create(User)

  get (Store) {
    return new Application(this, Store)
  }

  static async load (db, server, login) {
    const root = new BoxKeyPair(login.secretKey)
    const directory = await server.getEntry(root.publicKey(), 'directory', 0)
    const keys = await Keyring.lookup(server, directory.toString(), root)

    return User.create(db, server, keys)
  }

  static async initialize (db, server, login, { putKey = true } = {}) {
    const root = new BoxKeyPair(login.secretKey)
    const keyring = await Keyring.create(server, root)
    const keys = await keyring.fetch(root)

    const directory = new Buffer(keys.write.publicKey())
    const tokens = authTokens(root, root)
    await server.putEntry(login.publicKey, 'directory', 0, directory, tokens)

    if (putKey) {
      const { email } = login
      const empty = await BoxKeyPair.fromLogin(email, '')
      const tokens = authTokens(empty, empty)
      await server.putKey(email, login.publicKey, tokens)
    }

    return User.create(db, server, keys)
  }
}

User.firstLogin = async (server, email) => {
  const empty = await BoxKeyPair.fromLogin(email, '')
  const serverKey = await server.getKey(email)

  return empty.publicKey() === serverKey
}

User.fromLogin = BoxKeyPair.fromLogin

User.login = async (email, password) => {
  const keypair = await BoxKeyPair.fromLogin(email, password)
  return {
    email,
    secretKey: keypair.secretKey(),
    publicKey: keypair.publicKey(),
  }
}
