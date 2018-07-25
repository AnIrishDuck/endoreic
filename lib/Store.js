import { checkErrors } from './validate'
import StreamCache from './StreamCache'
import Table from './Table'
import Query from './Query'

export default class Store {
  constructor (db, server) {
    this.db = db
    this.server = server
    this.cache = new StreamCache(db)
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

  async create (objects) {
    const act = await (this.actions.create.build(this.store, objects))
    const errors = await act.errors(this.store)
    errors.forEach((error) => {
      checkErrors(`${this.Model.kind} entry`)(error, true)
    })
    const ids = await act.apply(this.store)
    return ids.map((id) => new this.Model(this.store, id))
  }

  async update (ids, update) {
    const act = await this.actions.update.build(this.store, { ids, update })
    const errors = await act.errors(this.store)
    errors.forEach((errors) => {
      checkErrors(`${this.Model.kind} entry`)(errors, true)
    })
    return act.apply(this.store)
  }

  async validate (data) {
    return this.Model.validate(await this.Model.prepare(data))
  }
}
