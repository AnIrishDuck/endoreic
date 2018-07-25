import { BoxKeyPair } from '../lib/crypto'
import User from '../lib/User'

let _cachedLogin = null
export const login = async () => {
  const email = 'foo@bar.com'
  const password = 'too many secrets'
  if (_cachedLogin === null) {
    const normalRounds = BoxKeyPair.rounds
    BoxKeyPair.rounds = 1
    _cachedLogin = await User.login(email, password)
    BoxKeyPair.rounds = normalRounds
  }

  return _cachedLogin
}
