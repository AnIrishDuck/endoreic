import { expect } from 'chai'
import _ from 'lodash'
import sqlite3 from 'sqlite3'
import uuid from 'uuid'
import Query from '../lib/Query'
import Table from '../lib/Table'

describe('Query', () => {
  const mem = () => new Table(new sqlite3.Database(':memory:'), 'example')

  const examples = [
    { uuid: uuid.v4(), ix: "0", abc: "10", def: "20" },
    { uuid: uuid.v4(), ix: "1", ghi: "10" },
    { uuid: uuid.v4(), ix: "2", abc: "10", ghi: "12" },
  ]

  const expectQuery = async (query, values) => {
    const table = await mem()
    await table.create(examples)
    const rows = query(new Query(table))
    expect(await rows.toArray()).to.deep.equal(values)
  }

  describe('where()', () => {
    it('can be used to query individual items', async () => {
      expectQuery(
        (query) => query.where({ abc: '10' }),
        [examples[0], examples[2]]
      )
      await expectQuery(
        (query) => query.where('abc LIKE "1%"'),
        [examples[0], examples[2]]
      )
      await expectQuery(
        (query) => query.where('abc LIKE ?', ['1%']),
        [examples[0], examples[2]]
      )
    })

    it('can be chained', async () => {
      await expectQuery(
        (query) =>
          query.where({ abc: '10' }).where('CAST(ix AS INTEGER) > ?', [0]),
        [examples[2]]
      )
    })
  })

  describe('order()', () => {
    it('can be used to order items', async () => {
      await expectQuery(
        (query) => query.order('ix DESC'),
        _.reverse([...examples])
      )
    })

    it('can be chained', async () => {
      await expectQuery(
        (query) =>
          query.order('abc').order('ix DESC'),
        [examples[1], examples[2], examples[0]]
      )
    })
  })

  it('can chain multiple where / order clauses', async () => {
    await expectQuery(
      (query) =>
        query.where('CAST(COALESCE(abc, "0") AS INTEGER) > ?', [-1])
          .where('CAST(ix as INTEGER) > ?', [0])
          .order('ix DESC')
          .order('def ASC'),
      [examples[2], examples[1]]
    )
    await expectQuery(
      (query) =>
        query.where('CAST(COALESCE(abc, "0") AS INTEGER) > ?', [-1])
          .where('CAST(ix AS INTEGER) > ?', [0])
          .order('ix DESC')
          .order('def ASC'),
      [examples[2], examples[1]]
    )
  })
})
