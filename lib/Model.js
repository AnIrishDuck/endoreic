import _ from 'lodash'
import { isUUID, validate } from './validate'

export default class Model {
  constructor (store, id) {
    this.store = store
    this.id = id
  }

  fetch () {
    return this.store.tables[this.constructor.kind].get(this.id)
  }

  static prepare (Kind) {
    return async (parsed) => {
      const { transform } = Kind
      const translations = _.toPairs(transform)
        .filter(([k]) => parsed[k] !== undefined)
        .map(([k, { toString }]) => (
          toString(parsed[k]).then((string) => [k, string])
        ))
      const translated = _.fromPairs(await Promise.all(translations))
      return { ...parsed, ...translated }
    }
  }

  static validate (Kind, expectations) {
    return (json) => {
      return validate({ id: isUUID, ...expectations })(json)
    }
  }
}
