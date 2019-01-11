/* eslint-env node, mocha */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'

import Keyring from '../lib/Keyring'
import { BoxKeyPair } from '../lib/crypto'
import { Server } from '../lib/fakes'

chai.use(chaiAsPromised)

describe('Keyring', () => {
  const user = new BoxKeyPair()

  it('can be created and includes creator key', async () => {
    const server = new Server()
    const ring = await Keyring.create(server, user)
    const { read } = await ring.fetch(user)

    const ciphertext = read.encrypt(new Buffer('too many secrets'))

    const other = await Keyring.lookup(server, ring.id, user)
    expect(other.read.decrypt(ciphertext).toString())
      .to.equal('too many secrets')
  })

  it('can include additional guest keys', async () => {
    const server = new Server()
    const ring = await Keyring.create(server, user)
    const { write } = await ring.fetch(user)

    const guest = new BoxKeyPair()
    await ring.add(user, guest)

    const ciphertext = guest.encrypt(write.publicKey(), new Buffer('too many secrets'))

    const other = await Keyring.lookup(server, ring.id, guest)
    expect(other.write.decrypt(guest.publicKey(), ciphertext).toString())
      .to.equal('too many secrets')
  })
})
