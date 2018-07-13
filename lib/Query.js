import assert from 'assert'
import _ from 'lodash'

const defaultParts = { selects: ['*'], terms: [], params: [], orders: [] }

export default class Query {
  constructor (table, parts = {}) {
    this.table = table
    this.parts = {
      ...defaultParts,
      ...parts
    }
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
    return new Query(this.table, {
      ...this.parts,
      terms: [...this.parts.terms, ...terms],
      params: [...this.parts.params, ...params],
    })
  }

  order (term) {
    return new Query(this.table, {
      ...this.parts,
      orders: [...this.parts.orders, term]
    })
  }

  select (term) {
    const prior = _.isEqual(this.parts.selects, ['*']) ? [] : this.parts.selects
    return new Query(this.table, {
      ...this.parts,
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

  _where () {
    const terms = this.parts.terms.map((t) => `(${t})`)
    return this._clause('WHERE ', terms, '\n  AND')
  }

  _order () {
    return this._clause('ORDER BY ', this.parts.orders, ', ')
  }

  sql () {
    return `
SELECT ${this._select()} FROM ${this.table.name}
${[this._where(), this._order()].join(' ')}
`
  }

  toArray () {
    return this.table._query({ sql: this.sql(), params: this.parts.params })
  }
}
