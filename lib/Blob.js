import assert from 'assert'
import _ from 'lodash'
import * as most from 'most'
import Store from './Store'

class NoOp {
  apply () { }
  unapply () { }
}

const _int = (v) => {
  assert(typeof v === 'number', `${v} is not a number`)
  assert(v % 1 === 0, `${v} has a fractional part`)
  return v
}

export default class Blob extends Store {
  static shard = 'chunks'
  static chunkSize = 16 * 1024

  serialize (data) {
    return data
  }

  deserialize (data) {
    return data
  }

  decrypt () {
    return new NoOp()
  }

  async read () {
    return this.stream.forward(false).concat(this.stream.forward(true))
      .map((blob) => super.decrypt(blob))
      .reduce(
        (acc, cur) => {
          const raw = Buffer.from([...acc, ...cur])
          return acc.length > 0 ? raw : raw.slice(8)
        },
        []
      )
  }

  async _getHead () {
    const [saved, pending] = await this.index()

    if (saved === 0 && pending === 0) {
      await this.sync()
    }
  }

  async progress () {
    await this._getHead()
    const [ saved ] = await this.index()

    const [ first ] = await this.stream.head(this.writer && saved === 0, 1)
    const bytes = _int(super.decrypt(first).readDoubleBE(0)) + 8
    const total = Math.ceil(bytes / Blob.chunkSize)

    return { saved, total, [this.writer ? 'up' : 'down']: true }
  }

  write (buffer) {
    this.writer = true

    const header = Buffer.alloc(8)
    header.writeDoubleBE(_int(buffer.length), 0)
    const chunks = _.chunk([...header, ...buffer], Blob.chunkSize)
      .map((bytes) => Buffer.from(bytes))

    return this.writeStream(most.from(chunks)).observe(_.noop)
  }

  writeStream (buffers) {
    return buffers
      .concatMap((chunk) => {
        const saved = this.persist(chunk).then(() => (chunk))
        return most.fromPromise(saved)
      })
  }

  async removePending () {
    const pending = this.stream.size(true)
    assert(pending == 0, 'cannot merge with blob from server')
  }

  static async create(db, server, keyring, data) {
    const blob = new Blob(db, server, keyring)
    await blob.write(data)
    return blob
  }

  static from(db, server, keyring) {
    return Promise.resolve(new Blob(db, server, keyring))
  }
}
