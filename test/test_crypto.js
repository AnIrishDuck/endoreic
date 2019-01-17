/* eslint-env node, mocha */

import assert from 'assert'
import bip39 from 'bip39'
import _ from 'lodash'
import sinon from 'sinon'
import { expect } from 'chai'
import nacl from 'tweetnacl'
import {
  BoxKeyPair,
  SecretKey,
  SignKeyPair,
  VerifyKey,
  encode,
  seedFromLogin
} from '../lib/crypto'

let pairs = {}
const noRepeats = (old) => (data, nonce, pk, sk) => {
  const n = encode(nonce)
  const d = encode(data)
  if (!_.isUndefined(pairs[n])) {
    assert(pairs[n] === d)
  } else {
    pairs[n] = d
  }
  return old(data, nonce, pk, sk)
}
sinon.replace(nacl.box, 'open', noRepeats(nacl.box.open))
sinon.replace(nacl.secretbox, 'open', noRepeats(nacl.secretbox.open))

describe('BoxKeyPair', () => {
  let message = new Buffer('always money in the banana stand')
  it('can encrypt / decrypt messages', () => {
    let alice = new BoxKeyPair()
    let server = new BoxKeyPair()
    let bob = new BoxKeyPair(server.secretKey())

    let cipher = alice.encrypt(bob.publicKey(), message)

    let plain = bob.decrypt(alice.publicKey(), cipher)

    assert.equal(message.toString(), plain.toString())
  })

  it('generates different key pairs automatically', () => {
    const a = new BoxKeyPair()
    const b = new BoxKeyPair()

    const cipher = a.encrypt(a.publicKey(), 'super secret')
    expect(() => b.decrypt(a.publicKey(), cipher)).to.throw('Invalid key')
  })

  it('can derive a reusable key from email / password', async () => {
    const email = 'bob@test.com'
    const password = 'too many secrets'
    const prior = BoxKeyPair.rounds
    seedFromLogin.rounds = 2
    const alice = await BoxKeyPair.fromLogin('alice@test.com', password)
    const bob = await BoxKeyPair.fromLogin(email, password)

    expect(bob.publicKey()).to.not.equal(alice.publicKey())

    const cipher = alice.encrypt(bob.publicKey(), message)

    const recreated = await BoxKeyPair.fromLogin(email, password)
    const plain = recreated.decrypt(alice.publicKey(), cipher)
    expect(plain.toString()).to.equal(message.toString())
    seedFromLogin.rounds = prior
  })

  it('can derive a key from a bip39 passphrase', async () => {
    const password = bip39.generateMnemonic()
    const prior = BoxKeyPair.rounds
    seedFromLogin.rounds = 2
    await BoxKeyPair.fromLogin('alice@test.com', password)
    seedFromLogin.rounds = prior
  })
})

describe('SignKeyPair', () => {
  const email = 'alice@test.com'

  it('can be used to seal messages and unseal remotely', async () => {
    const password = bip39.generateMnemonic()
    const prior = BoxKeyPair.rounds
    seedFromLogin.rounds = 2
    const seed = await seedFromLogin({ email, password })
    seedFromLogin.rounds = prior

    const key = new SignKeyPair(seed)
    const message = new Buffer('pop secret')
    const sealed = key.seal(message)
    const remote = new VerifyKey(key.publicKey())
    const unsealed = remote.open(sealed)
    expect(unsealed.toString()).to.equal(message.toString())
    expect(key.open(sealed).toString()).to.equal(message.toString())
  })

  it('can be stored locally', async () => {
    const key = new SignKeyPair()
    const message = new Buffer('pop secret')
    const reloaded = new SignKeyPair(key.seed())
    const sealed = reloaded.seal(message)
    expect(reloaded.open(sealed).toString()).to.equal(message.toString())
  })

  it('cannot be tampered with', async () => {
    const key = new SignKeyPair()
    const message = new Buffer('pop secret')
    const sealed = key.seal(message)
    const offset = 5
    sealed.writeInt8((sealed.readInt8(offset) + 1) % 255, offset)
    expect(() => key.open(sealed).toString()).to.throw('Invalid signature')
  })
})

describe('SecretKey', () => {
  it('can encrypt / decrypt messages', () => {
    let original = new SecretKey()

    let message = new Buffer('pop secret')
    let ciphertext = original.encrypt(message)

    let fromServer = new SecretKey(original.key())
    let plaintext = fromServer.decrypt(ciphertext)

    assert.equal(message.toString(), plaintext.toString())
  })

  it('generates different key pairs automatically', () => {
    const a = new SecretKey()
    const b = new SecretKey()

    const cipher = a.encrypt('super secret')
    expect(() => b.decrypt(cipher)).to.throw('Invalid key')
  })
})
