/*
 * types are used to enforce application consistency. They need to be in
 * application code so we can create DRY definitions that handle overlapping
 * concerns:
 * - validation
 * - JSON (de)serialization
 * - SQL (de)serialization
 */
import _ from 'lodash'
import moment from 'moment'
import validator from 'validator'

export const JsonConverter = (subtype) => ({
  toString: _.identity,
  fromString: _.identity,

  ...subtype
})

export const StringSubtype = (subtype) => JsonConverter({
  toJson: _.identity,
  fromJson: _.identity,

  ...subtype,

  validate: async (v) => subtype.validate(v)
})

export const String = JsonConverter({
  toJson: _.identity,
  fromJson: _.identity,

  validate: async (string) => typeof string === 'string'
})

export const Option = (inner) => ({
  toString: (json) =>
    _.isNull(json) ? `-` : `+${inner.toString(json)}`,
  fromString:
    (string) => string === '-' ? null : string.slice(1),

  toJson:
    (value) => value === null ? null : inner.toJson(value),
  fromJson:
    (json) => json === null ? null : inner.fromJson(json),

  validate: async (json, store) =>
    _.isNull(json) || await inner.validate(json, store)
})

export const Date = JsonConverter({
  toJson: (v) => v.format(),
  fromJson: moment,

  validate: async (v) => validator.isISO8601(v)
})
export const UUID = StringSubtype({ validate: validator.isUUID })

export const Enumeration = (possible) => {
  const set = new Set(possible)
  return StringSubtype({ set, validate: (json) => set.has(json) })
}

export const Reference = (getCollection) => JsonConverter({
  toJson: (value) => value.id,
  fromJson: (json, store) => getCollection(store).reference(json),

  validate: (json, store) => {
    const referee = getCollection(store).reference(json).fetch()
    return referee.then(() => true).catch(() => false)
  }
})

export const Record = (types) => {
  const sqlTypes = { ...types, id: UUID }

  return {
    keys: _.keys(types),

    toString: (json) => JSON.stringify(json),
    fromString: (string) => JSON.parse(string),

    toSql: (json) => {
      return _.fromPairs(
        _.keys(json).map((key) => [key, sqlTypes[key].toString(json[key])])
      )
    },

    fromSql: (sql) => {
      return _.fromPairs(
        _.toPairs(sqlTypes).map(([key, type]) => [key, type.fromString(sql[key])])
      )
    },

    toJson: (value) => {
      return _.fromPairs(
        _.keys(value).map((key) => [key, sqlTypes[key].toJson(value[key])])
      )
    },

    fromJson: (json, store) => {
      return _.fromPairs(
        _.toPairs(types).map(([key, type]) => [key, type.fromJson(json[key], store)])
      )
    },

    validate: async (json, store) => {
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
