import assert from 'assert'
import * as iter from 'iter-tools'
import _ from 'lodash'
import * as most from 'most'
import SQL from './SQL'

const init = `
CREATE TABLE IF NOT EXISTS cache (
  id TEXT,
  shard TEXT,
  sequence INTEGER,
  pending INTEGER,
  data BLOB
)
`

export default class StreamCache extends SQL {
  constructor (db) {
    super(db)
    this.db.serialize(() => {
      this._execute({ sql: init })
    })
  }

  stream (id, shard) {
    return new Stream(this.db, id, shard)
  }
}


class Stream extends SQL {
  constructor (db, id, shard) {
    super(db)
    this.id = id
    this.shard = shard
  }

  _pending(v) {
    return v ? 1 : 0
  }

  async min (pending) {
    const [ { v } ] = await this._query({ sql: `
      SELECT min(sequence) AS v FROM cache
      WHERE id = ? AND shard = ? AND pending = ?
      `,
    params: [this.id, this.shard, this._pending(pending)]
    })

    return v
  }

  async sequence (pending) {
    const [ { v } ] = await this._query({ sql: `
      SELECT max(sequence) AS v FROM cache
      WHERE id = ? AND shard = ? AND pending = ?
      `,
    params: [this.id, this.shard, this._pending(pending)]
    })

    return _.isUndefined(v) ? 0 : v + 1
  }

  async size (pending) {
    const sequence = await this.sequence(pending)
    const min = await this.min(pending)
    return sequence - (min || 0)
  }

  async push (pending, blob) {
    const sequence = await this.sequence(pending)
    await this._execute({ sql: `
      INSERT INTO cache (id, shard, sequence, pending, data) VALUES (?, ?, ?, ?, ?)
      `,
    params: [this.id, this.shard, sequence, this._pending(pending), blob]
    })
  }

  async pushAll (pending, blobs) {
    return this._executeAll(
      most.from(blobs)
        .concatMap((blob) => most.fromPromise(this.push(pending, blob)))
    )
  }

  async shift (count) {
    assert((await this.size(true)) >= count, 'Cannot shift beyond size')
    const start = await this.min(true)
    const end = start + count
    const range = iter.range({ start, end })
    const shift = async () => {
      const to = await this.sequence(false)
      const from = await this.min(true)
      await this._execute({ sql: `
        UPDATE cache SET sequence = ?, pending = ?
        WHERE id = ? AND shard = ? AND sequence = ? AND pending = ?
        `,
      params: [
        to, this._pending(false),
        this.id, this.shard, from, this._pending(true)
      ]
      })
    }
    return this._executeAll(
      most.generate(iter.map, _.noop, range)
        .concatMap(() => most.fromPromise(shift()))
    )
  }

  head (pending, n) {
    const stream = this.forward(pending).take(n).map((v) => [v])
    return stream.reduce((a, b) => a.concat(b), [])
  }

  forward (pending, mutate) {
    return this._iter(pending, _.identity, mutate)
  }

  reverse (pending, mutate) {
    return this._iter(pending, ({ start, end }) => ({
      start: end - 1,
      end: start - 1,
      step: -1
    }), mutate)
  }

  _iter (pending, _r, mutate) {
    assert(!mutate || pending, 'updates can only occur on pending data')
    const update = (ix) => async (data) => {
      return this._execute({
        sql: `
        UPDATE cache SET data = ?
        WHERE id = ? AND shard = ? AND sequence = ? AND pending = ?
        `,
        params: [data, this.id, this.shard, ix, this._pending(pending)]
      })
    }
    const fetch = async (ix) => {
      const [ { data } ] = await this._query({ sql: `
        SELECT data FROM cache
        WHERE id = ? AND shard = ? AND sequence = ? AND pending = ?
        `,
      params: [this.id, this.shard, ix, this._pending(pending)]
      })
      return mutate ? [data, update(ix)] : data
    }
    const bounds = Promise.all([this.min(pending), this.sequence(pending)])
    return most.fromPromise(bounds).flatMap(([start, end]) => {
      const range = iter.range(_r({ start, end }))
      return most.generate(iter.map, fetch, range)
    })
  }
}
