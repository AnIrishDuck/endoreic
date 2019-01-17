import _ from 'lodash'
import sqlite3 from 'sqlite3'
import { seedFromLogin } from '../lib/crypto'
import User from '../lib/User'
import { keyring, Server } from '../lib/fakes'

let _cachedLogin = null
export const login = async () => {
  const email = 'foo@bar.com'
  const password = 'too many secrets'
  if (_cachedLogin === null) {
    const normalRounds = seedFromLogin.rounds
    seedFromLogin.rounds = 1
    _cachedLogin = await User.login(email, password)
    seedFromLogin.rounds = normalRounds
  }

  return _cachedLogin
}

export const db = () => new sqlite3.Database(':memory:')

export const memoryStore = (Store) => {
  const ring = keyring()

  return (server) =>
    Store.create(db(), _.isUndefined(server) ? new Server() : server, ring)
}
