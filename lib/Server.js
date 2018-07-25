import axios from 'axios'
import _ from 'lodash'
import url from 'url'

import { encode } from './crypto'

let toArrayBuffer = (buf) => {
  var ab = new ArrayBuffer(buf.length)
  var view = new Uint8Array(ab)
  for (var i = 0; i < buf.length; ++i) {
    view[i] = buf[i]
  }
  return ab
}

const stripQuery = (prior) => {
  let parsed = url.parse(prior)
  delete parsed['search']
  return url.format(parsed)
}

export default class Server {
  constructor (base, options = {}) {
    this.base = base
    this.encodeData = options.encodeData
    this.cache = options.cache
    this.offline = options.offline
    this.api = axios
  }

  url (update) {
    let newUrl = url.parse(this.base)
    return url.format(_.assign(newUrl, update))
  }

  _put (path, data) {
    if (this.cache) {
      return this.cache.put(stripQuery(path), data)
        .then(() => data)
    } else {
      return Promise.resolve(data)
    }
  }

  _get (path) {
    if (this.cache) {
      return this.cache.get(stripQuery(path))
    } else {
      return Promise.resolve(undefined)
    }
  }

  _postData (path, data) {
    let headers = {
      'Content-Type': 'application/octet-stream'
    }
    let encoded = data

    if(this.encodeData) {
      encoded = new Buffer(data.toString('base64')).toString()
      headers['X-Content-Encoding'] = 'base64'
    }
    else {
      encoded = toArrayBuffer(encoded)
    }

    return this.api.post(path, encoded, { headers })
    .then(() => this._put(path, data))
  }

  _getData (path) {
    return this._get(path).then(async (data) => {
      if (data !== undefined) {
        return Promise.resolve(data)
      } else {
        return this.api.get(path, {responseType: 'arraybuffer'})
        .then((response) => new Buffer(response.data))
        .then((data) => this._put(path, data))
      }
    })
  }

  getKey (email) {
    const url = this.url({
      pathname: '/v1/key',
      query: { email }
    })

    return this.api.get(url, { responseType: 'json' })
    .then((r) => r.data.publicKey)
  }

  putEntry (name, partition, index, data, tokens) {
    let queryUrl = this.url({
      pathname: `/v1/${name}/${partition}/${index}`,
      query: { ...tokens },
    })


    return this._postData(queryUrl, data)
    .then(async (result) => {
      // we need to re-update our ids
      await this.getIndex(name, partition)
      return result
    })
  }

  getIndex (name, partition) {
    const path = this.url({pathname: `/v1/${name}/${partition}`})
    let json
    if (this.offline) {
      json = this._get(path).then((buffer) => {
        return JSON.parse(buffer.toString())
      })
    }
    else {
      json = this.api.get(path, {responseType: 'json'})
      .then(async (res) => {
        await this._put(path, new Buffer(JSON.stringify(res.data)))
        return res.data
      })
    }

    return json.then(({ index }) => index)
  }

  async getAll (name, partition) {
    const index = await this.getIndex(name, partition).catch(() => 0)
    const entries = _.range(index)
      .map((ix) => this.getEntry(name, partition, ix))

    return Promise.all(entries)
  }

  getEntry (name, partition, index) {
    return this._getData(this.url({
      pathname: `/v1/${name}/${partition}/${index}`
    }))
  }
}

const serverPublicKey = 'vMRQLuYxtxQwOF1w9Lbm1-iBQN_X7Y8gkDRVlEAHYhk'
// OBLIVOUS: encoded timestamp, boxed with server => key
export const authToken = (key) => {
    const time = (new Date()).getTime().toString()
    return encode(key.encrypt(serverPublicKey, new Buffer(time)))
}

// OBLIVIOUS:
// - auth: see authToken
// - owner: encoded public key
// - ownerAuth: see authToken
export const authTokens = (write, owner) => ({
  auth: authToken(write),
  owner: owner.publicKey(),
  ownerAuth: authToken(owner),
})
