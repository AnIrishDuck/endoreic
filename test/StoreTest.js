import { expect } from 'chai'
import sqlite3 from 'sqlite3'
import { BoxKeyPair, SecretKey } from '../lib/crypto'
import { expectRejection } from './util'
import Keymaster from './fixtures/Keymaster'

describe('Store', () => {
  const db = () => new sqlite3.Database(':memory:')

  const write = new BoxKeyPair()
  const keyring = {
    id: write.publicKey(),
    read: new SecretKey(),
    write
  }

  const master = () => new Keymaster(db(), null, keyring)

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
    const keymaster = master()

    await keymaster.groups.create([{ name: 'Some Passwords' }])
    await keymaster.groups.create([{ name: 'Secret Stuff' }])
    await keymaster.groups.create([{ name: 'Work Passwords' }])

    expect(await keymaster.stream.size(true)).to.equal(3)
  })
})
