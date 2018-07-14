import _ from 'lodash'
import { checkErrors, validate } from './validate'

export default class Model {
  constructor (raw) {
    _.assign(this, raw)
  }

  static create (Kind) {
    const { kind } = Kind
    return async (store, raw) => {
      const errors = await Kind.validate(store, raw)
      checkErrors(`${kind} entry`)(errors, true)
      return new Kind(raw)
    }
  }

  static validate (Kind, expectations) {
    return (store, json) => validate(expectations)(json)
  }
}
