import assert from 'assert'
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

    static async build (store, raw) {
      const objects = await Promise.all(raw.map(
        (o) => ({ id: o.id || uuid.v4(), ...Model.shape.toJson(o) })
      ))
      return new Create({ objects })
    }

    constructor (data) {
      super(data)
      this.objects = data.objects
    }

    errors (store) {
      return Promise.all(
        this.objects.map((raw) => Model.shape.validate(raw, store))
      ).then(removeBlanks)
    }

    _ids () {
      return this.objects.map((o) => o.id)
    }

    rebase () {
      return this
    }

    apply (store) {
      const strings = this.objects.map(Model.shape.toSql)
      return store.table(Model).create(strings).then(() => this._ids())
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
      .map((k) => ({ [k]: base[k] }))
  ])
}

export const update = (Model) => {
  class Update extends Action {
    static kind = name('update', Model)

    static async getPriors (store, { ids, update }) {
      const before = await Promise.all(ids.map((id) => (
        store.table(Model).get(id).then(Model.shape.fromSql)
      )))
      return before.map((data) => objectDiff(data, update))
    }

    static async build (store, { ids, update }) {
      assert(_.isUndefined(update.id))
      const json = _.pick(Model.shape.toJson(update, true), _.keys(update))
      const serial = { ids, update: json }
      const priors = await Update.getPriors(store, serial)
      return new Update({ priors, ...serial })
    }

    constructor(data) {
      super(data)
      this.ids = data.ids
      this.priors = data.priors
      this.update = data.update
    }

    errors (store) {
      return Promise.all(
        this.ids.map(async (id) => {
          const current = await store.table(Model).get(id)
          // eslint-disable-next-line no-unused-vars
          return Model.shape.validate({ ...current, ...this.update }, store)
        })
      ).then(removeBlanks)
    }

    _delta (diff, selector) {
      return _.mapValues(diff, selector)
    }

    apply (store) {
      return store.table(Model).update(this.ids, Model.shape.toSql(this.update))
    }

    async rebase (store) {
      const priors = await Update.getPriors(store, this)
      return new Update({ ...this, priors })
    }

    remove (store) {
      return Promise.all(
        _.zip(this.ids, this.priors)
          // eslint-disable-next-line no-unused-vars
          .filter(([ id, prior]) => _.keys(prior).length > 0)
          .map(([ id, prior ]) => {
            return store.table(Model).update([id], Model.shape.toSql(prior))
          })
      )
    }
  }

  return { update: Update }
}

export const actions = (Model) => ({
  ...create(Model), ...update(Model)
})
