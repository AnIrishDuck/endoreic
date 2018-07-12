import assert from 'assert'
import _ from 'lodash'

export default class Query {
  constructor (table, terms, params, orders) {
    this.table = table
    this.terms = terms || []
    this.params = params || []
    this.orders = orders || []
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
    return new Query(
      this.table,
      [...this.terms, ...terms],
      [...this.params, ...params],
      this.orders
    )
  }

  order (term) {
    return new Query(
      this.table,
      this.terms,
      this.params,
      [...this.orders, term]
    )
  }

  _clause (prefix, parts, joiner) {
    if (parts.length > 0) {
      return prefix + parts.join(joiner)
    } else {
      return ''
    }
  }

  _where () {
    return this._clause('WHERE ', this.terms.map((t) => `(${t})`), '\n  AND')
  }

  _order () {
    return this._clause('ORDER BY ', this.orders, ', ')
  }

  sql () {
    return this.table._sql([this._where(), this._order()].join(' '))
  }

  toArray () {
    return this.table._query({ sql: this.sql(), params: this.params })
  }
}
