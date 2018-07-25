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
import { authToken, decode, encode, BoxKeyPair, SecretKey } from './crypto'

// OBLIVIOUS:
// - auth: see authToken
// - owner: encoded public key
// - ownerAuth: see authToken
const tokens = (write, owner) => ({
  auth: authToken(write),
  owner: owner.publicKey(),
  ownerAuth: authToken(owner),
})

const createKeyring = async (server, owner, access) => {
  const read = new SecretKey()
  const write = new BoxKeyPair()
  const id = write.publicKey()

  let readStash = write.encrypt(access.publicKey(), read.keyBuffer())
  let writeStash = write.encrypt(access.publicKey(), write.secretKeyBuffer())

  let encryptedKeyring = {}
  encryptedKeyring[access.publicKey()] = {
    read: encode(readStash),
    write: encode(writeStash)
  }

  const keyringBuffer = new Buffer(JSON.stringify(encryptedKeyring))
  // OBLIVIOUS:
  // - id is an encoded public key
  // - keyringBuffer is JSON from encryptedKeyring:
  //   - read is an encoded blob encrypted with write => access box
  //   - write is an encoded blob encrypted with write => access box
  // - see tokens()
  await server.putEntry(id, 'keyring', 0, keyringBuffer, tokens(write, owner))
  return { id, read, write, owner }
}

const getKeyring = async (server, id, owner, access) => {
  // OBLIVIOUS:
  // - id is an encoded public key
  const keyringLatest = await server.getIndex(id, 'keyring')
  // OBLIVIOUS:
  // - id is an encoded public key
  // - keyringLatest - 1 is an integer that can only communicate / validate
  //   stream position
  const buffer = await server.getEntry(id, 'keyring', keyringLatest - 1)

  const keyring = JSON.parse(buffer)
  const pair = keyring[access.publicKey()]

  const readBuffer = access.decrypt(id, decode(pair.read))
  const read = new SecretKey(encode(readBuffer))

  const writeBuffer = access.decrypt(id, decode(pair.write))
  const write = new BoxKeyPair(encode(writeBuffer))

  return { id, read, write, owner}
}

export default class User {
  constructor (db, server, login) {
    this.db = db
    this.server = server
    this.login = login
    this.keypair = new BoxKeyPair(login.secretKey)
    this.id = this.keypair.publicKey()
  }

  async fetchKeyring(name, ix) {
    // OBLIVIOUS:
    // - id is an encoded public key
    // - name is a constant string for the application type
    // - ix - 1 is an integer that can only communicate / validate
    //   stream position
    const data = await this.server.getEntry(this.id, name, ix - 1)
    const json = JSON.parse(this.keypair.decrypt(this.id, data))

    const [ first ] = json

    const access = new BoxKeyPair(first.access)
    return getKeyring(this.server, first.id, this.keypair, access)
  }

  async createKeyring(name) {
    const { id } = this
    const owner = this.keypair
    const access = new BoxKeyPair()
    const keyring = await createKeyring(this.server, owner, access)
    const json = [
      {
        access: access.secretKey(),
        id: keyring.id,
      },
    ]

    const plaintext = new Buffer(JSON.stringify(json))
    const ciphertext = owner.encrypt(owner.publicKey(), plaintext)
    // OBLIVIOUS:
    // - id is an encoded public key
    // - ciphertext is encrypted with owner => owner box
    // - see tokens()
    await this.server.putEntry(id, name, 0, ciphertext, tokens(owner, owner))

    return keyring
  }

  async getKeyring (Store) {
    const name = Store.shard
    // OBLIVIOUS:
    // - id is an encoded public key
    // - name is a constant string for the application type
    const ix = await this.server.getIndex(this.id, name)

    if (ix > 0) {
      return this.fetchKeyring(name, ix)
    } else {
      return this.createKeyring(name)
    }
  }

  async getStore (Store) {
    return new Store(this.db, this.server, await this.getKeyring(Store))
  }
}

User.login = async (email, password) => {
  const keypair = await BoxKeyPair.fromLogin(email, password)
  return {
    email,
    secretKey: keypair.secretKey(),
    publicKey: keypair.publicKey(),
  }
}
