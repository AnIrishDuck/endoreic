import Model from '../../lib/Model'
import { isIn, isType, optional } from '../../lib/validate'

export default class Example extends Model {
  static kind = 'examples'
  static create = Model.create(Example)
  static validate = Model.validate(Example, {
    ix: optional(isType('number')),
    key: isIn(['a', 'b'])
  })
}
