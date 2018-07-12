import _ from 'lodash'
import * as most from 'most'

export default class SQL {
  constructor (db) {
    this.db = db
  }

  _stream (statement) {
    return most.from({
      [Symbol.observable]: () => ({
        subscribe: (observer) => {
          const row = (err, row) => {
            if (err) observer.error(err)
            _.keys(row).forEach((k) => {
              if (_.isNil(row[k])) {
                delete row[k]
              }
            })
            observer.next(row)
          }

          const fin = (err) => {
            if (err) observer.error(err)
            observer.complete()
          }

          this.db.each(statement.sql, statement.params, row, fin)
          return { unsubscribe: _.noop }
        }
      })
    })
  }

  _query (statement) {
    return this._stream(statement).map((v) => [v]).reduce(Array.concat, [])
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
