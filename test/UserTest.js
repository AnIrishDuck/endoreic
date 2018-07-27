/* eslint-env node, mocha */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import sqlite3 from 'sqlite3'

import User from '../lib/User'
import { BoxKeyPair } from '../lib/crypto'
import { Server } from './fakes'
import Keymaster from './fixtures/Keymaster'
import { login } from './fixtures'

chai.use(chaiAsPromised)

describe('User', () => {
  const db = () => new sqlite3.Database(':memory:')

  it('creates new default state', async () => {
    const server = new Server()
    const user = new User(db(), server, await login())
    const data = await user.getStore(Keymaster)
    expect(await data.index()).to.deep.equal([0, 0])
  })

  it('loads existing state when already present', async () => {
    const server = new Server()
    const user = new User(db(), server, await login())
    const keymaster = await user.getStore(Keymaster)

    const [ parent ] = await keymaster.groups.create([
      { name: 'All Passwords' }
    ])
    await keymaster.sync()

    const reloaded = await new User(db(), server, await login())
    const recreated = await reloaded.getStore(Keymaster)
    await recreated.sync()
    const reparent = await recreated.groups.reference(parent.id).fetch()
    expect(reparent.name).to.equal('All Passwords')
  })

  it('can tell when a user is new', async () => {
    const prior = BoxKeyPair.rounds
    BoxKeyPair.rounds = 2
    const server = new Server()
    const newEmail = 'testing@test.com'
    const newKey = await BoxKeyPair.fromLogin(newEmail, '')

    const oldEmail = 'present@test.com'
    const oldKey = await BoxKeyPair.fromLogin(oldEmail, 'super duper secret')

    server.keyPairs[newEmail] = newKey.publicKey()
    server.keyPairs[oldEmail] = oldKey.publicKey()

    await expect(User.firstLogin(server, newEmail)).to.eventually.equal(true)
    await expect(User.firstLogin(server, oldEmail)).to.eventually.equal(false)

    BoxKeyPair.rounds = prior
  })
})
