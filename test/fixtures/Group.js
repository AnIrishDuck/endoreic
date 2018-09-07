import * as cru from '../../lib/cru'
import Model from '../../lib/Model'
import * as types from '../../lib/types'

export default class Group extends Model {
  static kind = 'groups'

  static type = types.Record({
    name: types.String
  })
  static actions = cru.actions(Group)

  passwords () {
    return this.store.passwords.where({ parent: this.id })
  }
}
