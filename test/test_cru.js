import Promise from 'bluebird'
import { expect } from 'chai'
import _ from 'lodash'
import sqlite3 from 'sqlite3'
import uuid from 'uuid'

import { actions } from '../lib/cru'
import Query from '../lib/Query'
import Table from '../lib/Table'
import Example from './fixtures/Example'

const { create, update } = actions(Example)

const memStore = async () => {
  const db = new sqlite3.Database(':memory:')
  const table = new Table(db, Example.kind)
  await table.ready
  return {
    table: (Model) => {
      expect(Model.kind).to.equal(Example.kind)
      return table
    },
    [Example.kind]: new Query(db, Example.kind)
  }
}
const validateStack = (stack, unordered) => {
  const final = _.sortBy(unordered, (o) => [o.ix])

  const serialize = async (store, [Action, simple]) => {
    const initial = await Action.build(store, simple)
    return new Action(JSON.parse(JSON.stringify(initial)))
  }

  const rows = async (store) =>
    store.examples.order('ix').toArray().then((arr) => arr.map(Example.shape.fromSql))

  it('can be applied', async () => {
    const store = await memStore()
    await Promise.reduce(stack, (_acc, act) => (
      serialize(store, act).then((_act) => _act.apply(store))
    ), null)
    expect(await rows(store)).to.deep.equal(final)
  })

  it('has no errors', async () => {
    const store = await memStore()
    const errors = await Promise.reduce(stack, async (prior, act) => {
      const cereal = await serialize(store, act)
      await cereal.apply(store)
      return [...prior, ...(await cereal.errors(store))]
    }, [])
    expect(errors).to.deep.equal([])
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

describe('cru actions', () => {
  describe('with a stack of create data', () => {
    const objects = [
      { ix: '0', key: 'a' },
      { ix: '1', key: 'b' },
      { ix: '2', key: 'a' },
      { ix: '3', key: 'a' },
      { ix: '4', key: 'b' }
    ]
    const raw = objects.map((o) => ({ ...o, id: uuid.v4() }))
    const acts = _.chunk(raw, 2).map((chunk) => [create, chunk])

    validateStack(acts, raw)
  })

  describe('with combined create / update data', () => {
    const objects = [
      { ix: '0', key: 'a' },
      { ix: '1', key: 'b' },
      { ix: '2', key: 'a' },
    ]
    const raw = objects.map((o) => ({ ...o, id: uuid.v4() }))
    const ids = raw.map((o) => o.id)
    const updates = [
      { ixs: [1], up: { ix: '0', key: 'a' } },
      { ixs: [0, 1], up: { key: 'b' } },
      { ixs: [0], up: { ix: '5' } },
      { ixs: [1, 2], up: { key: 'a' } },
      { ixs: [1, 2], up: { key: 'b' } }
    ]

    const acts = [
      ...raw.map((start) => [create, [start]]),
      ...updates.map(
        ({ ixs, up }) => [
          update, {
            ids: ixs.map((ix) => ids[ix]),
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

  describe('updates', () => {
    it('errors if the specified id does not exist', async () => {
      const store = await memStore()
      const invalid = await update.build(store, {
        ids: [undefined],
        update: { key: 'a' }
      })

      expect(await invalid.errors(store)).to.deep.equal([
        { id: 'no row with id: undefined' }
      ])
    })
  })

  describe('on a rebase', () => {
    it('does nothing to a create', async () => {
      const store = await memStore()
      const original = { ix: '0', key: 'a' }
      const pending = await create.build(store, [original])
      const rebased = await pending.rebase(store)
      expect(rebased.objects.map((o) => _.omit(o, 'id')))
        .to.deep.equal([original])
    })

    it('changes update diff as needed', async () => {
      const store = await memStore()
      const original = { ix: '0', key: 'a' }
      const apply = (a) => a.apply(store)
      const [ id ] = await create.build(store, [original]).then(apply)
      const pending = await update.build(store, { ids: [id], update: { ix: '2' } })
      expect(_.pick(pending, ['ids', 'priors', 'update'])).to.deep.equal({
        ids: [id],
        priors: [{ ix: '0' }],
        update: { ix: '2' }
      })

      await update.build(store, { ids: [id], update: { ix: '1' } }).then(apply)
      const rebased = await pending.rebase(store)
      expect(_.pick(rebased, ['ids', 'priors', 'update'])).to.deep.equal({
        ids: [id],
        priors: [{ ix: '1' }],
        update: { ix: '2' }
      })
    })
  })
})
