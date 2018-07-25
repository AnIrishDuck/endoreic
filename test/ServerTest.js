/* eslint-env node, mocha */

import assert from 'assert'
import axios from 'axios'
import { expect } from 'chai'
import sinon from 'sinon'

import Server, { authToken } from '../lib/Server'
import { BoxKeyPair, SecretKey } from '../lib/crypto'

let k = new SecretKey()
let plaintext = new Buffer('super secret'.repeat(4))
let ciphertext = k.encrypt(plaintext)

let url = 'http://localhost:3000'
url = 'http://airdrop-env.us-east-1.elasticbeanstalk.com'

describe.skip('Server', () => {
  const owner = null // BoxKeyPair.fromLogin('fpmurphy@mtu.edu', 'testing')
  const ownerAuth = null // authToken(owner)

  it('can add / retrieve sequential items', async () => {
    const kp = new BoxKeyPair()
    const kid = kp.publicKey()
    const tokens = {
      auth: authToken(kp),
      owner: owner.publicKey(),
      ownerAuth,
    }

    const s = new Server(url)

    await s.putEntry(kid, 'partition', 0, ciphertext, tokens)

    const ix = await s.getIndex(kid, 'partition')
    assert.deepEqual(ix, 1)

    const data = await s.getEntry(kid, 'partition', 0)
    assert.equal(k.decrypt(data).toString(), plaintext.toString())
  })

  it('can get all entries in a partition', async () => {
    const kp = new BoxKeyPair()
    const kid = kp.publicKey()
    const tokens = {
      auth: authToken(kp),
      owner: owner.publicKey(),
      ownerAuth,
    }

    const s = new Server(url)

    const second = new Buffer('super secret 2'.repeat(4))
    await s.putEntry(kid, 'partition', 0, ciphertext, tokens)
    await s.putEntry(kid, 'partition', 1, k.encrypt(second), tokens)

    const entries = await s.getAll(kid, 'partition')
    const decrypted = entries.map((e) => k.decrypt(e).toString())

    const expected = [plaintext, second]
    expect(decrypted).to.deep.equal(expected.map((b) => b.toString()))
  })

  it('can get public keys by email', async () => {
    const s = new Server(url)

    console.log(await s.getKey('fpmurphy@mtu.edu'))
  })
})

const testCache = (entries) => ({
  get: (id) => Promise.resolve(entries[id]),
  put: (id, value) => {
    entries[id] = value
    return Promise.resolve(value)
  },
})

describe('Server cache', () => {
  const kp = new BoxKeyPair()
  const kid = kp.publicKey()
  const index = 3

  let testEntry = `${url}/v1/${kid}/partition/${index}`
  it('is consulted first', async () => {
    const stub = sinon.stub(axios, 'get')
    stub.throws()
    try {
      const cache = testCache({
        [testEntry]: ciphertext
      })
      const s = new Server(url, { cache })
      const entry = await s.getEntry(kid, 'partition', index)
      const decrypted = k.decrypt(entry).toString()
      expect(decrypted).to.equal(plaintext.toString())
    } finally {
      stub.restore()
    }
  })

  it('stores index, and uses stored value when offline', async () => {
    let stub = sinon.stub(axios, 'get')
    stub.resolves({ data: { index: 3 } })
    try {
      const store = {}
      const cache = testCache(store)
      const s = new Server(url, { cache })
      let index = await s.getIndex(kid, 'partition')
      expect(index).to.equal(3)

      stub.throws()
      const o = new Server(url, { cache, offline: true })
      index = await o.getIndex(kid, 'partition')
      expect(index).to.equal(3)
    } finally {
      stub.restore()
    }
  })

  it('stores previously fetched values', async () => {
    const stub = sinon.stub(axios, 'get')
    stub.resolves({ data: ciphertext })
    try {
      const cache = testCache({})
      const s = new Server(url, { cache })

      let entry = await s.getEntry(kid, 'partition', index)
      let decrypted = k.decrypt(entry).toString()
      expect(decrypted).to.equal(plaintext.toString())
      stub.throws()

      entry = await s.getEntry(kid, 'partition', index)
      decrypted = k.decrypt(entry).toString()
      expect(decrypted).to.equal(plaintext.toString())
    } finally {
      stub.restore()
    }
  })

  it('stores previously put values', async () => {
    const post = sinon.stub(axios, 'post')
    post.resolves()
    const get = sinon.stub(axios, 'get')
    get.throws()

    const cache = testCache({})
    const s = new Server(url, { cache })
    const index = sinon.stub(s, 'getIndex').resolves()

    try {
      await s.putEntry(kid, 'partition', index, ciphertext, authToken(kp))

      const entry = await s.getEntry(kid, 'partition', index)
      const decrypted = k.decrypt(entry).toString()
      expect(decrypted).to.equal(plaintext.toString())
    } finally {
      index.restore()
      post.restore()
      get.restore()
    }
  })
})
