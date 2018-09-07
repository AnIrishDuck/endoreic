import * as cru from '../../lib/cru'
import Model from '../../lib/Model'
import * as types from '../../lib/types'

export default class Password extends Model {
  static kind = 'passwords'

  static type = types.Row({
    parent: types.Reference((store) => store.groups),
    name: types.String,
    password: types.String
  })

  static actions = cru.actions(Password)
}
