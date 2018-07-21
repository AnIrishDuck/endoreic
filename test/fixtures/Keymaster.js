import Group from './Group'
import Password from './Password'
import Store from '../../lib/Store'

export default class Keymaster extends Store {
  static shard = 'keymaster'

  bind () {
    super.store(Group)
    super.store(Password)
  }
}
