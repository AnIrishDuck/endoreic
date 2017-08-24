import { takeArray, takeUuid } from './validate'
import { deleteAll, shallowMerge } from './util'

const name = (Model, act) => `${Model.name}.${act}`

export const crudActions = (Model, extend) => extend({
  add: (data) => { type: name(Model, 'add'), data },
  update: (ids, data) => { type: name(Model, 'remove'), ids, data },
  remove: (ids) => ({
    type: name(Model, 'remove'),
    ids: takeArray(takeUuid, ids)
  })
})

export const crudReducer = (Model) => (state, action) => {
  if (action.type === name(Model, 'add')) {
    const created = new Model(state, action.data)
    return state.set(takeUuid(action.data.id), created)
  } else if (action.type === name(Model, 'update')) {
    const updates = takeArray(takeUuid)(this.ids).map((id) => {
        const prior = state.get(id)
        const updated = { ...prior.json(), ...this.update }
        return [ id, new Model(state, updated) ]
    })
    return shallowMerge(state, updates)
  } else if (action.type === name(Model, 'remove')) {
    return deleteAll(state, takeArray(takeUuid)(this.ids))
  }
}
