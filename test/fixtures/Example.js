import Model from '../../lib/Model'
import { isIn, isType, optional } from '../../lib/validate'

export default class Example extends Model {
  static kind = 'examples'
  static prepare = Model.prepare(Example)
  static validate = Model.validate(Example, {
    ix: optional(isType('string')),
    key: isIn(['a', 'b'])
  })
}
