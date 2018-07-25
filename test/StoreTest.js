import { expect } from 'chai'
import sqlite3 from 'sqlite3'
import { expectRejection } from './util'
import Keymaster from './fixtures/Keymaster'

describe('Store', () => {
  const db = () => new sqlite3.Database(':memory:')

  it('can be used to create / update / query models and children', async () => {
    const keymaster = await new Keymaster(db(), null)
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
})
