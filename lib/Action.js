import uuid from 'uuid'

export default class Action {
  constructor(data) {
    this.id = data.id || uuid.v4()
    this.kind = this.constructor.kind
    this.time = data.time
  }

  static name = (action, Model) => `${Model.kind}.${action}`
}
