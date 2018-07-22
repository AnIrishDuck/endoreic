import Promise from 'bluebird'
import _ from 'lodash'
import { authToken } from './crypto'
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
    this.actions = {}
    this.bind()
  }

  store (Model) {
    const { kind } = Model
    const table = new Table(this.db, kind)
    this.tables[kind] = table
    _.values(Model.actions).forEach((Action) => {
      this.actions[Action.kind] = Action
    })
    this[kind] = new ModelSet(this, Model)
  }

  persist (action) {
    const json = JSON.stringify(action)
    const padded = json + ' '.repeat(1024 - (json.length % 1024))
    const data = new Buffer(padded)
    const encrypted = this.keyring.read.encrypt(data)
    return this.stream.push(true, encrypted)
  }

  serverIndex () {
    return this.server.getIndex(this.keyring.id, 'actions')
  }

  parse (blob) {
    const json = JSON.parse(this.keyring.read.decrypt(blob))
    const Action = this.actions[json.kind]
    return new Action(json)
  }

  async syncBatch (index, saved) {
    const remote = _.range(saved, Math.min(index, saved + 10)).map((ix) => {
      return this.server.getEntry(this.keyring.id, 'actions', ix)
    })
    const blobs = await Promise.all(remote)
    await Promise.reduce(blobs, async (_, blob) => {
      await this.stream.push(false, blob)
      return this.parse(blob).apply(this)
    }, null)
  }

  async sync (ownerTokens = {}) {
    const index = await this.serverIndex()
    const saved = await this.stream.size(false)

    if (index > saved) {
      await this.syncBatch(index, saved)
    }

    const batch = await this.stream.head(true, 10)
    return Promise.reduce(batch, async (sequence, blob) => {
        const tokens = {
            auth: authToken(this.keyring.write),
            owner: this.keyring.owner.publicKey(),
            ownerAuth: authToken(this.keyring.owner),
            ...ownerTokens,
        }
        const id = this.keyring.id
        await this.server.putEntry(id, 'actions', sequence, blob, tokens)
        return this.stream.shift(1).then(() => sequence + 1)
    }, index)
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
