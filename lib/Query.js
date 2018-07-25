import assert from 'assert'
import _ from 'lodash'

import SQL from './SQL'

const defaultParts = { selects: ['*'], terms: [], params: [], orders: [] }

export default class Query extends SQL {
  constructor (db, tables, parts = {}) {
    super(db)
    this.tables = tables
    this.parts = {
      ...defaultParts,
      ...parts
    }
  }

  _extend (parts) {
    return new Query(this.db, this.tables, {
      ...this.parts,
      ...parts
    })
  }

  where (_term, _params) {
    const sql = () => {
      if (_.isPlainObject(_term)) {
        assert(_.isUndefined(_params))
        return {
          terms: _.keys(_term).map((k) => `${k} = ?`),
          params: _.values(_term),
        }
      } else {
        return { terms: [_term], params: (_params || []) }
      }
    }
    const { terms, params } = sql()
    return this._extend({
      terms: [...this.parts.terms, ...terms],
      params: [...this.parts.params, ...params],
    })
  }

  order (term) {
    return this._extend({
      orders: [...this.parts.orders, term]
    })
  }

  select (term) {
    const prior = _.isEqual(this.parts.selects, ['*']) ? [] : this.parts.selects
    return this._extend({
      selects: [...prior, term]
    })
  }

  _clause (prefix, parts, joiner) {
    if (parts.length > 0) {
      return prefix + parts.join(joiner)
    } else {
      return ''
    }
  }

  _select () {
    return this.parts.selects.join(", ")
  }

  _tables () {
    if (_.isString(this.tables)) {
      return this.tables
    } else if (_.isPlainObject(this.tables)) {
      const names = _.toPairs(this.tables).map(([k, v]) => `${v} AS ${k}`)
      return names.join(', ')
    }
  }

  _where () {
    const terms = this.parts.terms.map((t) => `(${t})`)
    return this._clause('WHERE ', terms, '\n  AND')
  }

  _order () {
    return this._clause('ORDER BY ', this.parts.orders, ', ')
  }

  sql () {
    return `
SELECT ${this._select()} FROM ${this._tables()}
${[this._where(), this._order()].join(' ')}
`
  }

  toArray () {
    return this._query({ sql: this.sql(), params: this.parts.params })
  }

  fetch () {
    return this.toArray()
  }
}
