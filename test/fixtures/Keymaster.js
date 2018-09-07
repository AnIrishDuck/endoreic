import Group from './Group'
import Password from './Password'
import Store from '../../lib/Store'

export default class Keymaster extends Store {
  static shard = 'keymaster'

  static models = [Group, Password]
  static create = Store.create(Keymaster)
}
