import { expect } from 'chai'
import _ from 'lodash'
import sqlite3 from 'sqlite3'
import { BoxKeyPair, SecretKey } from '../lib/crypto'
import { Server } from './fakes'
import { expectRejection } from './util'
import Keymaster from './fixtures/Keymaster'

describe('Store', () => {
  const db = () => new sqlite3.Database(':memory:')

  const owner = new BoxKeyPair()
  const write = new BoxKeyPair()
  const keyring = {
    id: write.publicKey(),
    owner,
    read: new SecretKey(),
    write
  }

  const master = (server) =>
    new Keymaster(db(), _.isUndefined(server) ? new Server() : server, keyring)

  it('can be used to create / update / query models and children', async () => {
    const keymaster = master()
    const [ parent ] = await keymaster.groups.create([
      { name: 'All Passwords' }
    ])
    const rawPassword = {
      parent,
      name: 'Example',
      password: 'toomanysecrets',
    }
    const [ password ] = await keymaster.passwords.create([rawPassword])

    const updated = await keymaster.passwords.update(
      [password.id],
      { name: 'Updated Example' }
    )
    expect(updated.length).to.equal(1)

    expect((await password.fetch()).name).to.equal('Updated Example')

    const [ other ] = await parent.passwords().fetch()
    expect(other.id).to.equal(password.id)
  })

  it('persists actions in the stream cache', async () => {
    const keymaster = master(null)

    await keymaster.groups.create([{ name: 'Some Passwords' }])
    await keymaster.groups.create([{ name: 'Secret Stuff' }])
    await keymaster.groups.create([{ name: 'Work Passwords' }])

    expect(await keymaster.stream.size(true)).to.equal(3)
  })

  describe('.sync()', () => {
    it('moves actions from the pending stream cache to the server', async () => {
      const keymaster = master()

      await keymaster.groups.create([{ name: 'Some Passwords' }])
      await keymaster.groups.create([{ name: 'Secret Stuff' }])
      await keymaster.groups.create([{ name: 'Work Passwords' }])

      await keymaster.sync()

      expect(await keymaster.serverIndex()).to.equal(3)
      expect(await keymaster.stream.size(true)).to.equal(0)
    })

    it('merges actions from server', async () => {
      const server = new Server()
      const k1 = master(server)
      const k2 = master(server)

      await k1.groups.create([{ name: 'Some Passwords' }])
      await k1.groups.create([{ name: 'Secret Stuff' }])
      await k2.groups.create([{ name: 'Work Passwords' }])

      await k1.sync()
      await k2.sync()

      const groups = await k2.groups.select('id').toArray()
      expect(groups.length).to.equal(3)
    })
  })
})
