import _ from 'lodash'
import * as most from 'most'

export default class SQL {
  constructor (db) {
    this.db = db
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

  _execute (statement) {
    return new Promise((resolve, reject) => {
      this.db.run(statement.sql, statement.params || [], (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  _executeAll (statements) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        statements.observe(_.noop).then(resolve).catch(reject)
      })
    })
  }
}
