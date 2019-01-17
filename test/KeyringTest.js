/* eslint-env node, mocha */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'

import Keyring from '../lib/Keyring'
import { BoxKeyPair, SignKeyPair } from '../lib/crypto'
import { Server } from '../lib/fakes'

chai.use(chaiAsPromised)

describe('Keyring', () => {
  const user = {
    read: new BoxKeyPair(),
    write: new SignKeyPair()
  }

  it('can be created and includes creator key', async () => {
    const server = new Server()
    const ring = await Keyring.create(server, user)
    const { read } = await ring.fetch(user.read)

    const ciphertext = read.encrypt(new Buffer('too many secrets'))

    const other = await Keyring.lookup(server, ring.key, user.read)
    expect(other.read.decrypt(ciphertext).toString())
      .to.equal('too many secrets')
  })

  it('can include additional guest keys', async () => {
    const server = new Server()
    const ring = await Keyring.create(server, user)
    const { read } = await ring.fetch(user.read)

    const guestRead = new BoxKeyPair()
    await ring.add(user, guestRead.publicKey())

    const ciphertext = read.encrypt(new Buffer('too many secrets'))

    const other = await Keyring.lookup(server, ring.key, guestRead)
    expect(other.read.decrypt(ciphertext).toString())
      .to.equal('too many secrets')
  })
})
