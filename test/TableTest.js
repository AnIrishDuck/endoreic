import { expect } from 'chai'
import immutable from 'immutable'
import _ from 'lodash'
import sqlite3 from 'sqlite3'
import uuid from 'uuid'

import Table from '../lib/Table'

describe('Table', () => {
  const mem = () => new Table(new sqlite3.Database(':memory:'), 'example')

  const noId = { ix: 0, abc: 10, def: 20 }
  const examples = [
    { uuid: uuid.v4(), ix: "0", abc: "10", def: "20" },
    { uuid: uuid.v4(), ix: "1", ghi: "10" },
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

    it('requires the uuid field', async () => {
      const table = await mem()

      try {
        await table.create([noId])
        expect(false)
      } catch(e) {
        expect(e.message).to.equal('All objects must have a UUID')
      }
    })
  })
})
