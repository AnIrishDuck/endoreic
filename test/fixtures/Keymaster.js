import Group from './Group'
import Password from './Password'
import Store from '../../lib/Store'

export default class Keymaster extends Store {
  static shard = 'keymaster'

  async bind () {
    await super.store(Group)
    await super.store(Password)
  }

  static create = Store.create(Keymaster)
}
