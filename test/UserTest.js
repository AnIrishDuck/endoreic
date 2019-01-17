/* eslint-env node, mocha */
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import sqlite3 from 'sqlite3'

import User from '../lib/User'
import { seedFromLogin } from '../lib/crypto'
import { Server } from '../lib/fakes'
import Keymaster from './fixtures/Keymaster'
import { login } from './fixtures'

chai.use(chaiAsPromised)

describe('User', () => {
  const db = () => new sqlite3.Database(':memory:')

  const initUser = async (server) =>
    User.initialize(db(), server, await login(), { putKey: false })

  it('creates new default state', async () => {
    const server = new Server()
    const user = await initUser(server)

    const app = await user.get(Keymaster)
    const data = await app.create('Random Keys')
    expect(await data.index()).to.deep.equal([0, 0])
  })

  it('loads existing state when already present', async () => {
    const server = new Server()
    const user = await initUser(server)
    const app = await user.get(Keymaster)
    const keymaster = await app.create('Random Keys')

    const [ parent ] = await keymaster.groups.create([
      { name: 'All Passwords' }
    ])
    await user.sync()
    await keymaster.sync()

    const reloaded = await User.load(db(), server, await login())
    await reloaded.sync()
    const reloadedApp = await reloaded.get(Keymaster)
    const [ store ] = await reloadedApp.list()
    const recreated = await reloadedApp.get(store.storeId)
    await recreated.sync()
    const reparent = await recreated.groups.reference(parent.id).fetch()
    expect(reparent.name).to.equal('All Passwords')
  })

  it('can create key for new users', async () => {
    const prior = seedFromLogin.rounds
    seedFromLogin.rounds = 2
    const server = new Server()
    const email = 'testing@test.com'
    const password = 'too many secrets'
    await server.initUser(email)

    const login = await User.login(email, password)
    await User.initialize(db(), server, login)

    const newKey = await User.login(email, password)
    expect(server.keyPairs[email].seed()).to.equal(newKey.key)

    seedFromLogin.rounds = prior
  })
})
