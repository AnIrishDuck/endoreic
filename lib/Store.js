import { checkErrors } from './validate'
import StreamCache from './StreamCache'
import Table from './Table'
import Query from './Query'

export default class Store {
  constructor (db, server, keyring) {
    this.db = db
    this.server = server
    this.keyring = keyring

    this.cache = new StreamCache(db)
    this.stream = this.cache.stream(keyring.id, this.constructor.shard)
    this.tables = {}
    this.sets = {}
    this.bind()
  }

  store (Model) {
    const { kind } = Model
    const table = new Table(this.db, kind)
    this.tables[kind] = table
    this[kind] = new ModelSet(this, Model)
  }

  persist (action) {
    const json = JSON.stringify(action)
    const padded = json + ' '.repeat(1024 - (json.length % 1024))
    const data = new Buffer(padded)
    const encrypted = this.keyring.read.encrypt(data)
    return this.stream.push(true, encrypted)
  }

  table ({ kind }) {
    return this.tables[kind]
  }
}

class ModelSet extends Query {
  constructor (store, Model) {
    super(store.db, Model.kind)
    this.store = store
    this.Model = Model
    this.actions = Model.actions
  }

  async _apply (action) {
    const errors = await action.errors(this.store)
    errors.forEach((error) => {
      checkErrors(`${this.Model.kind} entry`)(error, true)
    })

    await this.store.persist(action)
    return action.apply(this.store)
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
}
