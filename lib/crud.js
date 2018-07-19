import _ from 'lodash'
import uuid from 'uuid'

class Action {
  constructor(data) {
    this.id = data.id || uuid.v4()
    this.kind = this.constructor.kind
    this.time = data.time
  }
}

const name = (action, Model) => `${Model.kind}.${action}`

export const create = (Model) => {
  class Create extends Action {
    static kind = name('create', Model)

    static builder () {
      return async (objects) => new Create({ objects })
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
      return store.table(Model).remove(this.objects.map((o) => o.id))
    }
  }

  return { create: Create }
}

const objectDiff = (base, update) => {
  return _.assign.apply(null, [
    {},
    ..._.keys(update)
      .filter((k) => base[k] !== update[k])
      .map((k) => ({ [k]: [base[k], update[k]] }))
  ])
}

export const update = (Model) => {
  class Update extends Action {
    static kind = name('update', Model)

    static builder (store) {
      return async ({ ids, update }) => {
        const before = await Promise.all(ids.map((id) => (
          store.table(Model).get(id)
        )))
        const diff = before.map(({ id, ...data }) => ({
          id,
          ...objectDiff(data, update)
        })).filter((delta) => _.keys(delta).length > 1)
        return new Update({ diff })
      }
    }

    constructor(data) {
      super(data)
      this.diff = data.diff
    }

    errors (store) {
      return Promise.all(
        this.diff.map(async ({ id, ...diff }) => {
          const current = this.table(store).get(id)
          Model.validate(store, { ...current.json(), ...diff })
        })
      )
    }

    _run (store, selector) {
      return Promise.all(
        this.diff.map(({ id, ...diff }) => {
          const selected = _.mapValues(diff, selector)
          return store.table(Model).update([id], selected)
        })
      )
    }

    apply (store) {
      // eslint-disable-next-line no-unused-vars
      return this._run(store, ([before, after]) => after)
    }

    remove (store) {
      return this._run(store, ([before]) => before)
    }
  }

  return { update: Update }
}

export const actions = (Model) => ({
  ...create(Model), ...update(Model)
})
