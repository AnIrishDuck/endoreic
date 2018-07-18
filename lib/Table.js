import assert from 'assert'
import _ from 'lodash'

import { isUUID } from './validate'
import Query from './Query'
import SQL from './SQL'

const sql = {
  metadata: `
  CREATE TABLE IF NOT EXISTS objects (
    tableName TEXT,
    type TEXT,
    name TEXT
  )
  `,
  model: (tableName) => `
  CREATE TABLE IF NOT EXISTS ${tableName} (
    uuid TEXT PRIMARY KEY
  )
  `,
  addColumn: (tableName, field) => `
  ALTER TABLE ${tableName} ADD COLUMN ${field} TEXT
  `,
  meta: {
    getColumns: `
    SELECT * FROM objects WHERE type='column' AND tableName=?
    `,
    addColumn: `
    INSERT INTO objects (tableName, type, name) VALUES (?, 'column', ?)
    `,
  }
}

const checkId = (uuid) => {
  const message = isUUID('uuid', uuid)
  if (_.isString(message)) assert(false, message)
}

const checkIds = (jsons) => jsons.forEach((json) => checkId(json.uuid))

const checkValues = (json) => {
  assert(_.isPlainObject(json), 'All objects must be plain')
  _.values(json).forEach(
    (v) => assert(_.isString(v), 'All values must be strings')
  )
}

const allKeys = (jsons) => {
  return jsons.reduce((acc, json) => _.union(acc, _.keys(json)), [])
}

const values = (keys) => (json) => keys.map((k) => json[k])

export default class Table extends SQL {
  constructor (db, name) {
    super(db)
    this.name = name
    this.db.serialize(() => {
      this._execute({ sql: sql.metadata })
      this._execute({ sql: sql.model(name) })
    })
  }

  _sql (clause) {
    return `SELECT * FROM ${this.name} ${clause}`
  }

  async get (uuid) {
    const rows = new Query(this.db, this.name).where({ uuid })
    return (await rows.toArray())[0]
  }

  async query (clause, params = []) {
    return this._query({sql: this._sql(clause), params })
  }

  async create (jsons) {
    checkIds(jsons)
    jsons.forEach(checkValues)

    const keys = allKeys(jsons)
    await this._prepare(keys)
    const wildcards = keys.map(_.constant('?'))
    const sql = this.db.prepare(`
    INSERT INTO ${this.name} (${keys.join(', ')}) VALUES (${wildcards})
    `)
    return this._runEach(sql, jsons.map(values(keys)))
  }

  async update (uuids, delta) {
    checkValues(delta)
    assert(_.isUndefined(delta.uuid), 'UUIDs are immutable')

    const keys = _.keys(delta)
    await this._prepare(keys)
    const updates = keys.map((k) => `${k} = ?`)
    const sql = this.db.prepare(`
    UPDATE ${this.name} SET ${updates.join(', ')} WHERE uuid = ?
    `)
    const ups = values(keys)(delta)
    const rows = uuids.map((uuid) => [...ups, uuid])
    return this._runEach(sql, rows)
  }

  async remove (uuids) {
    const sql = this.db.prepare(`
    DELETE FROM ${this.name} WHERE uuid = ?
    `)
    return this._runEach(sql, uuids)
  }

  async _prepare (keys) {
    const newKeys = _.difference(keys, ['uuid', ...await this._columns()])
    await Promise.all(newKeys.map(async (key) => {
      await this._execute({
        sql: sql.meta.addColumn,
        params: [this.name, key]
      })
      return this._execute({ sql: sql.addColumn(this.name, key) })
    }))
    return keys
  }

  _columns () {
    return this._query({ sql: sql.meta.getColumns, params: [ this.name ]})
               .then((rows) => rows.map(({ name }) => name))
  }
}
