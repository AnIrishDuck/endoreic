import { expect } from 'chai'
import sqlite3 from 'sqlite3'
import uuid from 'uuid'

import Table from '../lib/Table'
import { expectRejection } from './util'

describe('Table', () => {
  const mem = () => new Table(new sqlite3.Database(':memory:'), 'example')

  const examples = [
    { id: uuid.v4(), ix: "0", abc: "10", def: "20" },
    { id: uuid.v4(), ix: "1", ghi: "10" },
  ]

  describe('create()', () => {
    it('inserts query-able key / value pairs', async () => {
      const table = await mem()
      await table.create(examples)
      expect(await table.query('ORDER BY ix')).to.deep.equal(examples)
      expect(await table.query('WHERE ghi = ?', [10]))
        .to.deep.equal([examples[1]])
    })

    it('works with consecutive heterogoneous objects', async () => {
      const table = await mem()
      await table.create([examples[0]])
      await table.create([examples[1]])
      expect(await table.query('ORDER BY ix')).to.deep.equal(examples)
    })

    it('requires the id field', async () => {
      const table = await mem()
      const noId = { ix: '0', abc: '10', def: '20' }
      await expectRejection(
        table.create([noId]),
        "invalid id: 'undefined'"
      )

      return expectRejection(
        table.create([{ id: "wheeeee" }]),
        "invalid id: 'wheeeee'"
      )
    })

    it('requires all values to be strings', async () => {
      const table = await mem()
      const integer = { id: uuid.v4(), ix: 0 }
      return expectRejection(
        table.create([integer]),
        'All values must be strings'
      )
    })
  })

  describe('update()', () => {
    it('modifies fields in previously stored objects', async () => {
      const table = await mem()

      await table.create(examples)
      const up = { abc: "20" }
      await table.update([examples[0].id], up)

      expect(await table.query(' ORDER BY ix')).to.deep.equal([
        { ...examples[0], ...up }, examples[1]
      ])
    })

    it('can create a new field', async () => {
      const table = await mem()

      await table.create(examples)
      const up = { brandNew: "20" }
      await table.update([examples[1].id], up)

      expect(await table.query(' ORDER BY ix')).to.deep.equal([
        examples[0], { ...examples[1], ...up }
      ])
    })

    it('cannot change ids', async () => {
      const table = await mem()

      await table.create(examples)
      const up = { a: '20', id: uuid.v4(), b: '30' }
      return expectRejection(
        table.update([examples[1].id], up),
        'UUIDs are immutable'
      )
    })

    it('requires all values to be strings', async () => {
      const table = await mem()
      const integer = { ix: 0 }
      return expectRejection(
        table.update([uuid.v4()], integer),
        'All values must be strings'
      )
    })
  })

  describe('remove()', () => {
    it('removes previously stored objects', async () => {
      const table = await mem()

      await table.create(examples)
      await table.remove([examples[0].id])

      expect(await table.query()).to.deep.equal([
        examples[1]
      ])
    })
  })
})
