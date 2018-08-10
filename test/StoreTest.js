import Promise from 'bluebird'
import { expect } from 'chai'
import { Server } from '../lib/fakes'
import { memoryStore } from './fixtures'
import Keymaster from './fixtures/Keymaster'

describe('Store', () => {
  const master = memoryStore(Keymaster)

  const fullState = async (store) => ({
    groups: await store.groups.toArray(),
    passwords: await store.passwords.toArray()
  })

  const testRewindReplay = async (store) => {
    const reversed = (pending) =>
      store.stream.reverse(pending).reduce(Array.concat, [])
    const stack = [...(await reversed(true)), ...(await reversed(false))]
    const states = await Promise.reduce(stack, async (states, blob) => {
      const act = await store.parse(blob)
      const prior = await fullState(store)
      await act.remove(store)
      return [[act, prior], ...states]
    }, [])

    expect(await fullState(store)).to.deep.equal({ groups: [], passwords: [] })

    await Promise.reduce(states, async (_acc, [act, state]) => {
      await act.apply(store)
      expect(await fullState(store)).to.deep.equal(state)
    }, null)
  }

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

    const data = await password.fetch()
    const parentData = await data.parent.fetch()
    expect(data.name).to.equal('Updated Example')
    expect(parentData.name).to.equal('All Passwords')

    const [ other ] = await parent.passwords().fetch()
    expect(other.id).to.equal(password.id)

    await testRewindReplay(keymaster)
  })

  it('persists actions in the stream cache', async () => {
    const keymaster = master(null)

    await keymaster.groups.create([{ name: 'Some Passwords' }])
    await keymaster.groups.create([{ name: 'Secret Stuff' }])
    await keymaster.groups.create([{ name: 'Work Passwords' }])

    expect(await keymaster.stream.size(true)).to.equal(3)
    await testRewindReplay(keymaster)
  })

  it('notifies of changes when full state sync has happened', async () => {
    const keymaster = master(null)
    keymaster.groups.create([{ name: 'Some Passwords' }])
    await keymaster.changes().take(1).drain()
    expect((await keymaster.groups.fetch()).length).to.equal(1)
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
      await testRewindReplay(keymaster)
    })

    it('merges actions from server', async () => {
      const server = new Server()
      const k1 = master(server)
      const k2 = master(server)

      const collect = (stream) =>
        stream.map((index) => [ index ]).reduce(Array.concat, [])
      const changes1 = collect(k1.changes().take(3))
      const changes2 = collect(k2.changes().take(2))

      await k1.groups.create([{ name: 'Some Passwords' }])
      await k1.groups.create([{ name: 'Secret Stuff' }])
      await k2.groups.create([{ name: 'Work Passwords' }])

      await k1.sync()
      await k2.sync()

      const groups = await k2.groups.select('id').toArray()
      expect(groups.length).to.equal(3)

      expect(await changes1).to.deep.equal([[0, 1], [0, 2], [2, 0]])
      expect(await changes2).to.deep.equal([[0, 1], [3, 0]])

      await testRewindReplay(k1)
      await testRewindReplay(k2)
    })

    it('converges to a consistent state', async () => {
      const server = new Server()
      const k1 = master(server)
      const k2 = master(server)

      const [ group1 ] = await k1.groups.create([{ name: 'Some Passwords' }])
      const group2 = await k2.groups.reference(group1.id)
      await k1.sync()
      await k2.sync()
      await k1.groups.update([group1.id], { name: 'First' })
      await k2.groups.update([group1.id], { name: 'Second' })
      await k2.groups.update([group1.id], { name: 'Third' })
      await k2.groups.update([group1.id], { name: 'Fourth' })

      await k1.sync()
      await k2.sync()
      await k1.sync()

      expect((await group1.fetch()).name).to.equal((await group2.fetch()).name)
      await testRewindReplay(k1)
      await testRewindReplay(k2)
    })
  })
})
