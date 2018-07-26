import _ from 'lodash'
import sqlite3 from 'sqlite3'
import { BoxKeyPair, SecretKey } from '../lib/crypto'
import User from '../lib/User'
import { Server } from './fakes'

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

export const db = () => new sqlite3.Database(':memory:')

export const memoryStore = (Store) => {
  const owner = new BoxKeyPair()
  const write = new BoxKeyPair()
  const keyring = {
    id: write.publicKey(),
    owner,
    read: new SecretKey(),
    write
  }

  return (server) =>
    new Store(db(), _.isUndefined(server) ? new Server() : server, keyring)
}
