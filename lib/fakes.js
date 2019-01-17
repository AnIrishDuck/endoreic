import assert from 'assert'
import _ from 'lodash'

import { seedFromLogin, SecretKey, SignKeyPair } from './crypto'

export class Server {
  constructor () {
    this.seqs = {}
    this.keyPairs = {}
  }

  _key (key, partition) {
    return `${key.publicKey()}=${partition}`
  }

  create (owner, key, partition) {
    const inverse = _.keyBy(_.values(this.keyPairs), (k) => k.seed())
    assert(inverse[owner.seed()] !== undefined, `no keypair for ${owner.seed()}`)

    const id = this._key(key, partition)
    this.seqs[id] = []
  }

  putEntry (key, partition, index, data) {
    assert(key.seed().length > 0)
    const seqKey = this._key(key, partition)
    const prior = this.seqs[seqKey]

    assert(!_.isUndefined(prior), `not created: ${seqKey}`)
    assert.equal(prior.length, index)

    prior.push(data)
    this.seqs[seqKey] = prior
    return Promise.resolve()
  }

  getIndex (key, partition) {
    const prior = this.seqs[this._key(key, partition)]
    if (prior) {
      return Promise.resolve(prior.length)
    } else {
      return Promise.resolve(0)
    }
  }

  getEntry (key, partition, index) {
    let prior = this.seqs[this._key(key, partition)] || []
    if (prior[index] === undefined) {
      let err = new Error(`not found: ${key.publicKey()} ${partition} ${index}`)
      err.response = { status: 404 }
      return Promise.reject(err)
    } else {
      return Promise.resolve(prior[index])
    }
  }

  async getAll (key, partition) {
    const index = await this.getIndex(key, partition)
    const entries = _.range(index).map((ix) => {
      return this.getEntry(key, partition, ix)
    })

    return Promise.all(entries)
  }

  async removeEntry (key, partition, index) {
    let prior = this.seqs[this._key(key, partition)] || []
    prior[index] = undefined
  }

  touch (key, partition) {
    this.seqs[this._key(key, partition)] = []
  }

  touchUser ({ email, write }) {
    this.keyPairs[email || `auto@${write.publicKey()}`] = write
  }

  touchLogin ({ email, key }) {
    const write = new SignKeyPair(key)
    this.touchUser({ email, write })
  }

  initUser (email) {
    return seedFromLogin({ email, password: '' }).then(
      (seed) => this.keyPairs[email] = new SignKeyPair(seed)
    )
  }

  putKey (email, prior, next) {
    const priorKey = this.keyPairs[email]

    assert(priorKey.seed() === prior.seed())

    this.keyPairs[email] = next
    return Promise.resolve()
  }
}

export const keyring = () => ({
  read: new SecretKey(),
  write: new SignKeyPair()
})
