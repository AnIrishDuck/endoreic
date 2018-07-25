/* eslint-env node, mocha */
import { expect } from 'chai'
import sqlite3 from 'sqlite3'

import User from '../lib/User'
import { Server } from './fakes'
import Keymaster from './fixtures/Keymaster'
import { login } from './fixtures'

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
})
