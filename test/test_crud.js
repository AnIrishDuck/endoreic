import Promise from 'bluebird'
import { expect } from 'chai'
import _ from 'lodash'
import sqlite3 from 'sqlite3'
import uuid from 'uuid'

import { actions } from '../lib/crud'
import Query from '../lib/Query'
import Table from '../lib/Table'
import Example from './fixtures/Example'

const {
  ['examples.add']: add,
  ['examples.update']: update,
} = actions(Example)

const validateStack = (stack, unordered) => {
  const final = _.sortBy(unordered, (o) => [o.ix])
  const memStore = async () => {
    const db = new sqlite3.Database(':memory:')
    const table = new Table(db, Example.kind)
    return {
      table: (Model) => {
        expect(Model.kind).to.equal(Example.kind)
        return table
      },
      [Example.kind]: new Query(db, Example.kind)
    }
  }

  const serialize = async (store, [Action, simple]) => {
    const initial = await Action.builder(store)(simple)
    return new Action(JSON.parse(JSON.stringify(initial)))
  }

  const rows = async (store) =>
    store.examples.order('ix').toArray().then((arr) => arr)

  it('can be applied', async () => {
    const store = await memStore()
    await Promise.reduce(stack, (_acc, act) => (
      serialize(store, act).then((_act) => _act.apply(store))
    ), null)
    expect(await rows(store)).to.deep.equal(final)
  })

  it('can be unapplied', async () => {
    const store = await memStore()
    const states = await Promise.reduce(stack, async (prior, [Action, simple]) => {
      const act = await serialize(store, [Action, simple])
      await act.apply(store)
      const reserial = new Action(JSON.parse(JSON.stringify(act)))
      return [[reserial, await rows(store)], ...prior]
    }, [])

    await Promise.reduce(states, async (prior, [act, state]) => {
      expect(await rows(store)).to.deep.equal(state)
      await act.remove(store)
    }, null)
    expect(await rows(store)).to.deep.equal([])
  })
}

describe('crud actions', () => {
  describe('with a stack of create data', () => {
    const objects = [
      { ix: '0', key: 'a' },
      { ix: '1', key: 'b' },
      { ix: '2', key: 'a' },
      { ix: '3', key: 'a' },
      { ix: '4', key: 'b' }
    ]
    const raw = objects.map((o) => ({ ...o, uuid: uuid.v4() }))
    const acts = _.chunk(raw, 2).map((chunk) => [add, chunk])

    validateStack(acts, raw)
  })

  describe('with combined create / update data', () => {
    const objects = [
      { ix: '0', key: 'a' },
      { ix: '1', key: 'b' },
      { ix: '2', key: 'a' },
    ]
    const raw = objects.map((o) => ({ ...o, uuid: uuid.v4() }))
    const uuids = raw.map((o) => o.uuid)
    const updates = [
      { ixs: [1], up: { ix: '0', key: 'a' } },
      { ixs: [0, 1], up: { key: 'b' } },
      { ixs: [0], up: { ix: '5' } },
      { ixs: [1, 2], up: { key: 'a' } },
      { ixs: [1, 2], up: { key: 'b' } }
    ]

    const acts = [
      ...raw.map((start) => [add, [start]]),
      ...updates.map(
        ({ ixs, up }) => [
          update, {
            uuids: ixs.map((ix) => uuids[ix]),
            update: up
          }
        ]
      )
    ]

    const final = updates.reduce((prior, { ixs, up }) => {
      const delta = (ix) => (_.indexOf(ixs, ix) !== -1) ? up : {}
      return _.range(0, 3).map((ix) => ({
        ...prior[ix], ...delta(ix)
      }))
    }, raw)

    validateStack(acts, final)
  })
})
