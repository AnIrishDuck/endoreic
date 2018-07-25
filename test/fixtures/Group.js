import * as crud from '../../lib/crud'
import Model from '../../lib/Model'
import { isType } from '../../lib/validate'

export default class Group extends Model {
  static kind = 'groups'
  static prepare = Model.prepare(Group)
  static validate = Model.validate(Group, {
    name: isType('string'),
  })
  static actions = crud.actions(Group)

  passwords () {
    return this.store.passwords.where({ parent: this.id })
  }
}
