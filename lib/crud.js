import _ from 'lodash'
import uuid from 'uuid'

class Action {
  constructor(data) {
    this.uuid = data.uuid || uuid.v4()
    this.kind = this.constructor.kind
    this.time = data.time
  }
}

const name = (action, Model) => `${Model.kind}.${action}`

export const add = (Model) => {
  class Add extends Action {
    static kind = name('add', Model)

    static builder () {
      return async (objects) => new Add({ objects })
    }

    constructor (data) {
      super(data)
      this.objects = data.objects
    }

    errors (store) {
      return Promise.all(
        this.objects.map((raw) => Model.validate(store, raw))
      )
    }

    apply (store) {
      return store.table(Model).create(this.objects)
    }

    remove (store) {
      return store.table(Model).remove(this.objects.map((o) => o.uuid))
    }
  }

  return { [Add.kind]: Add }
}

export const actions = (Model) => ({
  ...add(Model)
})
