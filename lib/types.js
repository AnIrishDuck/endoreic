import _ from 'lodash'
import moment from 'moment'
import validator from 'validator'

export class Type {
  toString (json) { return json }
  fromString (string) {  return string }

  toJson () { throw new Error('not implemented') }
  fromJson () {  throw new Error('not implemented') }

  async validate () { throw new Error('not implemented') }
}

export const String = new class extends Type {
  toJson(value) { return value }
  fromJson(json) { return json }

  async validate (string) { return typeof string === 'string' }
}

export const Option = (inner) => {
  return new class extends Type {
    toString (json) {
      return _.isNull(json) ? `-` : `+${inner.toString(json)}`
    }

    fromString (string) {
      return string === '-' ? null : string.slice(1)
    }

    toJson (value) {
      return value === null ? null : inner.toJson(value)
    }

    fromJson (json) {
      return json === null ? null : inner.fromJson(json)
    }

    async validate (json, store) {
      return _.isNull(json) || await inner.validate(json, store)
    }
  }
}

export const simple = (toJson, fromJson, validate) => new class extends Type {
  toJson (value) { return toJson(value) }
  fromJson (json) { return fromJson(json) }

  async validate (json) { return validate(json) }
}

export const Date = simple((v) => v.format(), moment, validator.isISO8601)
export const UUID = simple(_.identity, _.identity, validator.isUUID)

export const Enumeration = (possible) => {
  const set = new Set(possible)
  return new class extends Type {
    toJson (value) { return value }
    fromJson (json) { return json }
    async validate (json) { return set.has(json) }
  }
}

export const Reference = (getCollection) => new class extends Type {
  toJson (value) { return value.id }
  fromJson (json, store) { return getCollection(store).reference(json) }

  validate (json, store) {
    const referee = getCollection(store).reference(json).fetch()
    return referee.then(() => true).catch(() => false)
  }
}

export const Fields = (types) => {
  const sqlTypes = { ...types, id: UUID }

  return new class extends Type {
    constructor() {
      super()
      this.keys = _.keys(types)
    }

    toString (json) { return JSON.stringify(json) }
    fromString (string) { return JSON.parse(string) }

    toSql (json) {
      return _.fromPairs(
        _.keys(json).map((key) => [key, sqlTypes[key].toString(json[key])])
      )
    }

    fromSql (sql) {
      return _.fromPairs(
        _.toPairs(sqlTypes).map(([key, type]) => [key, type.fromString(sql[key])])
      )
    }

    toJson (value) {
      return _.fromPairs(
        _.keys(value).map((key) => [key, sqlTypes[key].toJson(value[key])])
      )
    }

    fromJson (json, store) {
      return _.fromPairs(
        _.toPairs(types).map(([key, type]) => [key, type.fromJson(json[key], store)])
      )
    }

    async validate (json, store) {
      const pairs = await Promise.all(
        _.keys(sqlTypes).concat(_.keys(json)).map((key) => {
          const type = sqlTypes[key]
          if (type !== undefined) {
            const value = _.get(json, key)
            return type.validate(value, store).then((v) => [key, v])
          } else {
            return Promise.resolve([key, 'invalid key'])
          }
        })
      )

      const errors = pairs
        // eslint-disable-next-line no-unused-vars
        .filter(([k, v]) => !_.isUndefined(v) && v !== true)
        // eslint-disable-next-line no-unused-vars
        .map(([k, v]) => [k, v === false ? `invalid value: ${v}` : v])

      return errors.length > 0 ? _.fromPairs(errors) : undefined
    }
  }
}
