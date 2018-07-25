import * as cru from '../../lib/cru'
import Model from '../../lib/Model'
import { isType, isUUID } from '../../lib/validate'

export default class Password extends Model {
  static kind = 'passwords'
  static transform = {
    parent: {
      toString: (value) => value.fetch().then((g) => g.id),
      toValue: (string, store) => Promise.resolve(store.groups.reference(string))
    }
  }
  static prepare = Model.prepare(Password)
  static validate = Model.validate(Password, {
    parent: isUUID,
    name: isType('string'),
    password: isType('string')
  })
  static actions = cru.actions(Password)
}
