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
} = actions(Example)

const validateStack = (stack, final) => {
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

  const serialize = async (store) => {
    const rebuilt = stack.map(async ([Action, simple]) => {
      const initial = await Action.builder(store)(simple)
      return new Action(JSON.parse(JSON.stringify(initial)))
    })

    return await Promise.all(rebuilt)
  }

  const rows = async (store) =>
    store.examples.order('ix').toArray().then((arr) => arr)

  it('can be applied', async () => {
    const store = await memStore()
    const acts = await serialize(store)
    await Promise.reduce(acts, (_acc, act) => act.apply(store), null)
    expect(await rows(store)).to.deep.equal(final)
  })

  it('can be unapplied', async () => {
    const store = await memStore()
    const acts = await serialize(store)
    const states = await Promise.reduce(acts, async (prior, act) => {
      await act.apply(store)
      return [await rows(store), ...prior]
    }, [])

    const pairs = _.zip(_.reverse(acts), states)
    await Promise.reduce(pairs, async (prior, [act, state]) => {
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
})
