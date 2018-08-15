import assert from 'assert'
import Promise from 'bluebird'
import EventEmitter from 'eventemitter3'
import _ from 'lodash'
import * as most from 'most'
import { authTokens } from './Server'
import { checkErrors } from './validate'
import Model from './Model'
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
  constructor (db, server, keyring) {
    this.db = db
    this.server = server
    this.keyring = keyring

    this.events = new EventEmitter()
    this.cache = new StreamCache(db)
    this.stream = this.cache.stream(keyring.id, this.constructor.shard)
    this.tables = {}
    this.actions = {}
  }

  static create (Subclass) {
    return (db, server, keyring) => {
      const store = new Subclass(db, server, keyring)
      return store.bind().then(() => store)
    }
  }

  store (Model) {
    const { kind } = Model
    const table = new Table(this.db, kind)
    this.tables[kind] = table
    _.values(Model.actions).forEach((Action) => {
      this.actions[Action.kind] = Action
    })
    this[kind] = new ModelSet(this, Model)
    return table._prepare(Model.validate.keys)
  }

  serialize (action) {
    const json = JSON.stringify(action)
    return new Buffer(json + ' '.repeat(1024 - (json.length % 1024)))
  }

  encrypt (action) {
    const data = this.serialize(action)
    return this.keyring.read.encrypt(data)
  }

  onChange = () =>
    this.index().then((index) => this.events.emit('change', index))

  changes () {
    return most.fromEvent('change', this.events)
  }

  persist (action) {
    // CRYPTO: blob encrypted with this.keyring.read
    return this.stream.push(true, this.encrypt(action))
  }

  serverIndex () {
    // OBLIVIOUS:
    // - this.keyring.id is an encoded public key
    return this.server.getIndex(this.keyring.id, 'actions')
  }

  index () {
    return Promise.all([false, true].map((p) => this.stream.size(p)))
  }

  parse (blob) {
    const json = JSON.parse(this.keyring.read.decrypt(blob))
    const Action = this.actions[json.kind]
    return new Action(json)
  }

  removeAll (pending) {
    return streamOrderedForEach(
      this.stream.reverse(pending),
      (blob) => this.parse(blob).remove(this)
    )
  }

  async syncBatch (index, saved) {
    const remote = _.range(saved, Math.min(index, saved + 10)).map((ix) => {
      // OBLIVIOUS:
      // - this.keyring.id is an encoded public key
      // - ix is an integer that can only communicate / validate
      //   stream position
      return this.server.getEntry(this.keyring.id, 'actions', ix)
    })
    const blobs = await Promise.all(remote)
    await inOrder(blobs, async (blob) => {
      // CRYPTO: blob is encrypted with this.keyring.read, otherwise the
      // decrypt() in parse will fail.
      await this.stream.push(false, blob)
      return this.parse(blob).apply(this)
    }, null)
  }

  async rebase () {
    return streamOrderedForEach(
      this.stream.forward(true, true),
      async ([blob, swap]) => {
        const act = this.parse(blob)
        const rebased = await act.rebase(this)
        // CRYPTO: blob encrypted with this.keyring.read
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

    const batch = await this.stream.head(true, 10)
    await Promise.reduce(batch, async (sequence, blob) => {
      const {  id, write, owner } = this.keyring
      const tokens = authTokens(write, owner)
      // The only things that can come from this.stream.head() were blobs
      // previously inserted from push(). We are still overly paranoid and
      // verify that the blob is encrypted with our read key. This is a guard
      // against programming errors and a basic sanity check.
      assert(this.keyring.read.decrypt(blob).length > 0)
      // OBLIVIOUS:
      // - id is an encoded public key
      // - sequence is an integer that can only communicate / validate
      //   stream position
      // - blob is encrypted with this.keyring.read
      // - see authTokens()
      await this.server.putEntry(id, 'actions', sequence, blob, tokens)
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

class ModelSet extends Query {
  constructor (store, Model, parts = {}) {
    super(store.db, Model.kind, parts)
    this.store = store
    this.Model = Model
    this.actions = Model.actions
  }

  _extend (parts) {
    return new ModelSet(this.store, this.Model, {
      ...this.parts,
      ...parts
    })
  }

  async _apply (action) {
    const errors = await action.errors(this.store)
    errors.forEach((error) => {
      checkErrors(`${this.Model.kind} entry`)(error, true)
    })

    await this.store.persist(action)
    const result = await action.apply(this.store)
    this.store.onChange()
    return result
  }

  async create (objects) {
    const act = await (this.actions.create.build(this.store, objects))
    const ids = await this._apply(act)
    return ids.map((id) => new this.Model(this.store, id))
  }

  async update (ids, update) {
    const act = await this.actions.update.build(this.store, { ids, update })
    return this._apply(act)
  }

  async validate (data) {
    return this.Model.validate(await this.Model.prepare(data))
  }

  reference (id) {
    return new this.Model(this.store, id)
  }

  _stream (statement) {
    return super._stream(statement).map((strings) => {
      return Model.parse(this.Model)(this.store, strings)
    }).awaitPromises()
  }
}
