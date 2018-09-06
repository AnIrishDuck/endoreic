import Model from '../../lib/Model'
import * as types from '../../lib/types'

export default class Example extends Model {
  static kind = 'examples'

  static type = types.Fields({
    ix: types.Option(types.String),
    key: types.Enumeration(['a', 'b'])
  })
}
