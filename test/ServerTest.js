/* eslint-env node, mocha */

import assert from 'assert'
import { expect } from 'chai'

import Server, { authToken, checkToken } from '../lib/Server'
import { BoxKeyPair, SecretKey, SignKeyPair } from '../lib/crypto'

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

describe('Server crypto', () => {
  it('can create and verify tokens', () => {
    const auth = new SignKeyPair()
    const other = new SignKeyPair()

    const token = authToken(auth)
    expect(checkToken(auth.publicKey(), token)).to.be.true
    expect(checkToken(other.publicKey(), token)).to.be.false
  })
})
