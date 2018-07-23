import _ from 'lodash'
import { isUUID, validate } from './validate'

const translate = async (data, transform) => {
  const translations = _.toPairs(transform)
    .filter(([k]) => data[k] !== undefined)
    .map(([k, f]) => (
      f(data[k]).then((string) => [k, string])
    ))
  const translated = _.fromPairs(await Promise.all(translations))
  return { ...data, ...translated }
}

export default class Model {
  constructor (store, id) {
    this.store = store
    this.id = id
  }

  async fetch () {
    const query = this.store[this.constructor.kind]
    const [ data ] = await query.where({ id: this.id }).toArray()
    return data
  }

  static prepare (Kind) {
    return async (parsed) => {
      const transform = _.mapValues(Kind.transform, (v) => v.toString)
      return translate(parsed, transform)
    }
  }

  static parse (Kind) {
    return (store, raw) => {
      const transform = _.mapValues(Kind.transform, (v) =>
        (string) => v.toValue(string, store)
      )
      return translate(raw, transform)
    }
  }

  static validate (Kind, expectations) {
    return (json) => {
      return validate({ id: isUUID, ...expectations })(json)
    }
  }
}
