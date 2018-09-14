/*
 * types are used to enforce application consistency. They need to be in
 * application code so we can create DRY definitions that handle overlapping
 * concerns:
 * - validation
 * - JSON (de)serialization
 * - SQL (de)serialization
 */
import assert from 'assert'
import _ from 'lodash'
import moment from 'moment'
import validator from 'validator'

export const JsonConverter = (subtype) => ({
  toString: _.identity,
  fromString: _.identity,

  ...subtype
})

export const Date = JsonConverter({
  toJson: (v) => v.format(),
  fromJson: moment,

  validate: async (v) => validator.isISO8601(v)
})

export const Reference = (getCollection) => JsonConverter({
  toJson: (value) => value.id,
  fromJson: (json, store) => getCollection(store).reference(json),

  validate: (json, store) => {
    const referee = getCollection(store).reference(json).fetch()
    return referee.then(() => true).catch(() => false)
  }
})

export const StringSubtype = (subtype) => JsonConverter({
  toJson: _.identity,
  fromJson: _.identity,

  validate: (v, store) => subtype.validate(v, store),

  ...subtype
})

export const String = StringSubtype({
  validate: async (string) => Promise.resolve(typeof string === 'string')
})

const NonSqlPrimitive = (fromString, jsTypeOf) => StringSubtype({
  toString: (v) => v.toString(),
  fromString,
  validate: async (v) => Promise.resolve(typeof v === jsTypeOf)
})

export const Boolean = NonSqlPrimitive(
  (v) => v === 'true' ? true : false,
  'boolean'
)

export const Number = NonSqlPrimitive((s) => parseFloat(s), 'number')

export const UUID = StringSubtype({ validate: async (v) => validator.isUUID(v) })

export const Enumeration = (possible) => {
  const set = new Set(possible)
  return StringSubtype({ set, validate: async (json) => set.has(json) })
}

const JsonToString = (subtype) => ({
  toString: (json) => JSON.stringify(json),
  fromString: (string) => JSON.parse(string),

  ...subtype,
})

export const Json = JsonToString({
  toJson: _.identity,
  fromJson: _.identity,

  validate: (v) => Promise.resolve(_.isPlainObject(v))
})

const assertType = (name) => (Type) => {
  assert(typeof _.get(Type, 'toJson') === 'function', `${name} missing toJson`)
  assert(typeof _.get(Type, 'fromJson') === 'function', `${name} missing fromJson`)
  assert(typeof _.get(Type, 'toString') === 'function', `${name} missing toString`)
  assert(typeof _.get(Type, 'fromString') === 'function', `${name} missing fromString`)
  assert(typeof _.get(Type, 'validate') === 'function', `${name} missing validate`)
  return Type
}

export const Option = _.flow(assertType('Option.inner'), (inner) => ({
  toString: (json) =>
    _.isNull(json) ? `-` : `+${inner.toString(json)}`,
  fromString:
    (string) => string === '-' ? null : inner.fromString(string.slice(1)),

  toJson:
    (value) => value === null ? null : inner.toJson(value),
  fromJson:
    (json) => json === null ? null : inner.fromJson(json),

  validate: async (json, store) =>
    _.isNull(json) && !_.isUndefined(json) || await inner.validate(json, store)
}))

const extractErrors = (pairs) => (
  // eslint-disable-next-line no-unused-vars
  pairs.filter(([k, v]) => !_.isUndefined(v) && v !== true)
    // eslint-disable-next-line no-unused-vars
    .map(([k, v]) => [k, v === false ? 'invalid value' : v])
)

export const List = _.flow(assertType('Element'), (Element) => JsonToString({
  toJson: (value) => value.map(Element.toJson),
  fromJson: (json, store) => json.map((v) => Element.fromJson(v, store)),
  validate: async (json, store) => {
    const errors = extractErrors(await Promise.all(_.flatten(
      json.map((element, index) => (
        Element.validate(element, store).then((e) => [index, e])
      ))
    )))
    return errors.length > 0 ? _.toPairs(errors): undefined
  }
}))

export const Record = (types) => {
  _.toPairs(types).map(([k, v]) => assertType(k)(v))

  const mapWithType = (f) => (o) => _.fromPairs(
    _.keys(o).map((k) => {
      const Type = types[k]
      assertType(k)(Type)
      return [k, f(Type, o[k])]
    })
  )

  return JsonToString({
    keys: _.keys(types),

    toString: (json) => JSON.stringify(json),
    fromString: (string) => JSON.parse(string),

    toSql: mapWithType((Type, value) => Type.toString(value)),

    fromSql: mapWithType((Type, value) => Type.fromString(value)),

    toJson: mapWithType((Type, value) => Type.toJson(value)),

    fromJson: (json, store) => {
      return _.fromPairs(
        _.toPairs(types).map(([key, type]) => [key, type.fromJson(json[key], store)])
      )
    },

    validate: async (json, store) => {
      const pairs = await Promise.all(
        _.keys(types).concat(_.keys(json)).map((key) => {
          const type = types[key]
          if (type !== undefined) {
            const value = _.get(json, key)
            const promise = type.validate(value, store)
            assert(
              typeof promise.then === 'function',
              `${key}.validate returns a promise`
            )
            return promise.then((v) => [key, v])
          } else {
            return Promise.resolve([key, 'invalid key'])
          }
        })
      )

      const errors = extractErrors(pairs)
      return errors.length > 0 ? _.fromPairs(errors) : undefined
    }
  })
}

export const Row = (columns) => Record({ ...columns, id: UUID })
