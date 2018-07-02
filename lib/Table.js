import assert from 'assert'
import _ from 'lodash'

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

const checkIds = (jsons) => {
  jsons.forEach((json) =>
    assert(!_.isUndefined(json.uuid), 'All objects must have a UUID')
  )
}

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

export default class Table {
  constructor (db, name) {
    this.db = db
    this.name = name
    this.db.serialize(() => {
      this._execute({ sql: sql.metadata })
      this._execute({ sql: sql.model(name) })
    })
  }

  async query (clause, params = []) {
    return this._query({sql: `SELECT * FROM ${this.name} ${clause}`, params })
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

  _query (statement) {
    return new Promise((resolve, reject) => {
      const rows = []
      const saveRow = (err, row) => {
        if (err) reject(err)
        _.keys(row).forEach((k) => {
          if (_.isNil(row[k])) {
            delete row[k]
          }
        })
        rows.push(row)
      }

      const complete = (err) => {
        if (err) reject(err)
        resolve(rows)
      }

      this.db.each(statement.sql, statement.params, saveRow, complete)
    })
  }

  _runEach (sql, rows) {
    return Promise.all(rows.map((row) => {
      return new Promise((resolve, reject) => {
        sql.run(row, (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }))
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

  _execute (statement) {
    return new Promise((resolve, reject) => {
      this.db.run(statement.sql, statement.params || [], (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
}
