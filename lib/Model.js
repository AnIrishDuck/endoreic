import _ from 'lodash'

export default class Model {
  constructor (store, fields) {
    this.store = store
    _.assign(this, fields)
  }
}
