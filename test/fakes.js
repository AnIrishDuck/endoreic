import assert from 'assert'
import _ from 'lodash'

import { decode, BoxKeyPair } from '../lib/crypto'
import { checkToken } from '../lib/Server'
import User from '../lib/User'

export const key = new BoxKeyPair('LbV-X7nAoyRiFq3IsCo8A2rGMCo-F85jYfb5GFU3NSA')

export class Server {
  constructor () {
    this.seqs = {}
    this.keyPairs = {}
  }

  putEntry (name, partition, index, data, { auth }) {
    let prior = this.seqs[`${name}=${partition}`] || []

    assert.equal(prior.length, index)

    const time = key.decrypt(name, decode(auth)).toString()
    const currentTime = (new Date()).getTime()
    assert(Math.abs(currentTime - time) < 3600 * 1000)

    prior.push(data)
    this.seqs[`${name}=${partition}`] = prior
    return Promise.resolve()
  }

  getIndex (name, partition) {
    const prior = this.seqs[`${name}=${partition}`]
    if (prior) {
      return Promise.resolve(prior.length)
    } else {
      return Promise.resolve(0)
    }
  }

  getEntry (name, partition, index) {
    let prior = this.seqs[`${name}=${partition}`] || []
    if (prior[index] === undefined) {
      let err = new Error()
      err.response = { status: 404 }
      return Promise.reject(err)
    } else {
      return Promise.resolve(prior[index])
    }
  }

  async getAll (name, partition) {
    const index = await this.getIndex(name, partition)
    const entries = _.range(index).map((ix) => {
      return this.getEntry(name, partition, ix)
    })

    return Promise.all(entries)
  }

  async removeEntry (name, partition, index) {
    let prior = this.seqs[`${name}=${partition}`] || []
    prior[index] = undefined
  }

  initUser (email) {
    return User.fromLogin(email, '').then(
      (kp) => this.keyPairs[email] = kp.publicKey()
    )
  }

  getKey (email) {
    const kp = this.keyPairs[email]
    const err = { response: { status: 404 } }
    return _.isUndefined(kp) ? Promise.reject(err) : Promise.resolve(kp)
  }

  putKey (email, publicKey, tokens) {
    const prior = this.keyPairs[email]

    assert(prior === tokens.owner)
    assert(checkToken(prior, tokens.ownerAuth))

    this.keyPairs[email] = publicKey
    return Promise.resolve()
  }
}
