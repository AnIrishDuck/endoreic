import _ from 'lodash'

export default class Model {
  constructor (store, fields) {
    this.store = store
    _.assign(this, fields)
  }

  fetch () {
    return Promise.resolve(this)
  }

  toJson () {
    const raw = _.pick(this, this.constructor.shape.keys)
    return this.constructor.shape.toJson(raw)
  }
}
