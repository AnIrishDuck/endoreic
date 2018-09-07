import Model from '../../lib/Model'
import * as types from '../../lib/types'

export default class Example extends Model {
  static kind = 'examples'

  static shape = types.Row({
    ix: types.Option(types.String),
    key: types.Enumeration(['a', 'b'])
  })
}
