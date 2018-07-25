import Group from './Group'
import Password from './Password'
import Store from '../../lib/Store'

export default class Keymaster extends Store {
  bind () {
    super.store(Group)
    super.store(Password)
  }
}
