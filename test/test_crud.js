import Promise from 'bluebird'
import { expect } from 'chai'
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

  const keys = async (store) =>
    store.examples.order('ix').toArray().then((arr) => arr.map((m) => m.key))

  it('can be applied', async () => {
    const store = await memStore()
    const acts = await serialize(store)
    await Promise.reduce(acts, (_acc, act) => act.apply(store), null)
    expect(await keys(store)).to.deep.equal(final)
  })
}

describe('crud actions', () => {
  describe('can be used to create models', () => {
    const raw = [
      [add, [{ ix: '0', key: 'a', uuid: uuid.v4() }]],
      [add, [{ ix: '1', key: 'b', uuid: uuid.v4() }]],
      [add, [{ ix: '2', key: 'a', uuid: uuid.v4() }]],
      [add, [{ ix: '3', key: 'a', uuid: uuid.v4() }]],
      [add, [{ ix: '4', key: 'b', uuid: uuid.v4() }]],
    ]

    validateStack(raw, ['a', 'b', 'a', 'a', 'b'])
  })
})
