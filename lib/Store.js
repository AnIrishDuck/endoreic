import assert from 'assert'
import Promise from 'bluebird'
import EventEmitter from 'eventemitter3'
import _ from 'lodash'
import * as most from 'most'
import { checkErrors } from './validate'
import StreamCache from './StreamCache'
import Table from './Table'
import Query from './Query'

const inOrder = (values, f) => {
  return Promise.reduce(values, async (_, cur) => {
    return f(cur)
  }, null)
}

const streamOrderedForEach = async (stream, f) => {
  const values = await stream.map((v) => [v]).reduce((a, b) => a.concat(b), [])
  return inOrder(values, f)
}

export default class Store {
  constructor (db, server, keys) {
    this.db = db
    this.server = server
    this.keys = keys
    this.id = keys.write.publicKey()

    this.events = new EventEmitter()
    this.cache = new StreamCache(db)
    this.stream = this.cache.stream(this.id, this.constructor.shard)
    this.tables = {}
    this.actions = {}
    this.batchSizes = { push: 10, pull: 10 }
  }

  static create (Subclass) {
    return (db, server, keys) => {
      const store = new Subclass(db, server, keys)
      return store.bind().then(() => store)
    }
  }

  async bind () {
    await Promise.all(this.constructor.models.map((M) => this.store(M)))
  }

  store (Model) {
    const { kind } = Model
    const sqlId = this.id.replace(/-/g, '_')
    const table = new Table(this.db, `${kind}_${sqlId}`)
    this.tables[kind] = table
    _.values(Model.actions).forEach((Action) => {
      this.actions[Action.kind] = Action
    })
    this[kind] = new ModelSet(this, Model)
    return table._prepare(Model.shape.keys)
  }

  serialize (action) {
    const json = JSON.stringify(action)
    return new Buffer(json + ' '.repeat(1024 - (json.length % 1024)))
  }

  encrypt (action) {
    const data = this.serialize(action)
    return this.keys.read.encrypt(data)
  }

  onChange = () =>
    this.index().then((index) => this.events.emit('change', index))

  changes () {
    return most.fromEvent('change', this.events)
  }

  persist (action) {
    // CRYPTO: blob encrypted with this.keys.read
    return this.stream.push(true, this.encrypt(action))
  }

  serverIndex () {
    return this.server.getIndex(this.keys.write, 'actions')
  }

  actions (count) {
    return this.stream.head(true, count).map((blob) => {
      return JSON.parse(this.keys.read.decrypt(blob).toString())
    })
  }

  index () {
    return Promise.all([false, true].map((p) => this.stream.size(p)))
  }

  deserialize (data) {
    const json = JSON.parse(data)
    const Action = this.actions[json.kind]
    return new Action(json)
  }

  decrypt (blob) {
    const data = this.keys.read.decrypt(blob)
    return this.deserialize(data)
  }

  removeAll (pending) {
    return streamOrderedForEach(
      this.stream.reverse(pending),
      (blob) => this.decrypt(blob).remove(this)
    )
  }

  async syncBatch (index, saved) {
    const { pull } = this.batchSizes
    const remote = _.range(saved, Math.min(index, saved + pull)).map((ix) => {
      // OBLIVIOUS:
      // - ix is an integer that can only communicate / validate
      //   stream position
      return this.server.getEntry(this.keys.write, 'actions', ix)
    })
    const blobs = await Promise.all(remote)
    await inOrder(blobs, async (blob) => {
      // CRYPTO: blob is encrypted with this.keys.read, otherwise decrypt()
      // will fail.
      await this.stream.push(false, blob)
      return this.decrypt(blob).apply(this)
    }, null)
  }

  async rebase () {
    return streamOrderedForEach(
      this.stream.forward(true, true),
      async ([blob, swap]) => {
        const act = this.decrypt(blob)
        const rebased = await act.rebase(this)
        // CRYPTO: blob encrypted with this.keys.read
        return swap(this.encrypt(rebased)).then(() => act.apply(this))
      }
    )
  }

  async sync () {
    const index = await this.serverIndex()
    const saved = await this.stream.size(false)

    const pull = index > saved
    if (pull) {
      await this.removeAll(true)
      await this.syncBatch(index, saved)
      await this.rebase()
    }

    const batch = await this.stream.head(true, this.batchSizes.push)
    await Promise.reduce(batch, async (sequence, blob) => {
      const { read, write } = this.keys
      // The only things that can come from this.stream.head() were blobs
      // previously inserted from push(). We are still overly paranoid and
      // verify that the blob is encrypted with our read key. This is a guard
      // against programming errors and a basic sanity check.
      assert(read.decrypt(blob).length > 0)
      // OBLIVIOUS:
      // - blob is encrypted with this.keys.read
      await this.server.putEntry(write, 'actions', sequence, blob)
      return this.stream.shift(1).then(() => sequence + 1)
    }, index)

    if (pull || batch.length > 0) {
      this.onChange()
    }
  }

  table ({ kind }) {
    return this.tables[kind]
  }
}


class Reference {
  constructor (id, query) {
    this.id = id
    this.query = query
  }

  async fetch () {
    const [ data ] = await this.query.where({ id: this.id }).toArray()
    return data
  }
}

class ModelSet extends Query {
  constructor (store, Model, parts = {}) {
    super(store.db, store.table(Model).name, parts)
    this.store = store
    this.Model = Model
    this.actions = Model.actions
    assert(Model.actions !== undefined, 'a model must define actions')
    _.keys(this.actions).map((k) => {
      this[k] = this.actions[k].run(this)
    })
  }

  _extend (parts) {
    return new ModelSet(this.store, this.Model, {
      ...this.parts,
      ...parts
    })
  }

  async apply (action) {
    const errors = await action.errors(this.store)
    errors.forEach((error) => {
      checkErrors(`${this.Model.kind}.${action.kind} entry`)(error, true)
    })

    await this.store.persist(action)
    const result = await action.apply(this.store)
    await this.store.onChange()
    return result
  }

  validate (data) {
    // eslint-disable-next-line no-unused-vars
    return this.Model.shape.validate(data)
  }

  reference (id) {
    const query = this.store[this.Model.kind]
    return new Reference(id, query)
  }

  _stream (statement) {
    return super._stream(statement).map((strings) => {
      const json = this.Model.shape.fromSql(strings)
      return new this.Model(this.store, {
        id: json.id, ...this.Model.shape.fromJson(json, this.store)
      })
    })
  }
}
