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

const removeBlanks = (objects) => objects.filter((o) => _.keys(o).length > 0)

export const create = (Model) => {
  class Create extends Action {
    static kind = name('create', Model)

    static async build (store, objects) {
      const jsons = await Promise.all(objects.map(Model.prepare))
      return new Create({
        objects: jsons.map((o) => ({ id: uuid.v4(), ...o }))
      })
    }

    constructor (data) {
      super(data)
      this.objects = data.objects
    }

    errors () {
      return Promise.all(
        this.objects.map((raw) => Model.validate(raw))
      ).then(removeBlanks)
    }

    _ids () {
      return this.objects.map((o) => o.id)
    }

    apply (store) {
      return store.table(Model).create(this.objects).then(() => this._ids())
    }

    remove (store) {
      return store.table(Model).remove(this._ids())
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

    static async build (store, { ids, update }) {
      const before = await Promise.all(ids.map((id) => (
        store.table(Model).get(id)
      )))
      const json = await Model.prepare(update)
      const diff = before.map(({ id, ...data }) => ({
        id,
        ...objectDiff(data, json)
      })).filter((delta) => _.keys(delta).length > 1)
      return new Update({ diff })
    }

    constructor(data) {
      super(data)
      this.diff = data.diff
    }

    errors (store) {
      return Promise.all(
        this.diff.map(async ({ id, ...diff }) => {
          const current = await store.table(Model).get(id)
          // eslint-disable-next-line no-unused-vars
          const delta = this._delta(diff, ([before, after]) => after)
          return Model.validate({ ...current, ...delta })
        })
      ).then(removeBlanks)
    }

    _delta (diff, selector) {
      return _.mapValues(diff, selector)
    }

    _run (store, selector) {
      return Promise.all(
        this.diff.map(({ id, ...diff }) => {
          return store.table(Model).update([id], this._delta(diff, selector))
        })
      )
    }

    apply (store) {
      // eslint-disable-next-line no-unused-vars
      const _after = ([before, after]) => after
      return this._run(store, _after).then(() => this.diff)
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
