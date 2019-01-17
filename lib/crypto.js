import base64url from 'base64-url'
import _ from 'lodash'
import nacl from 'tweetnacl'
import scrypt from 'scrypt-js'

export let encode = (d) => base64url.encode(d)
export let decode = (s) => new Buffer(base64url.unescape(s), 'base64')

let randomNonce = () => nacl.randomBytes(nacl.box.nonceLength)
let packNonce = (nonce, buffer) => new Buffer([...nonce, ...buffer])
let unpackNonce = (buffer) => {
  let nonce = new Uint8Array(buffer.slice(0, nacl.box.nonceLength))
  let ciphertext = new Uint8Array(buffer.slice(nacl.box.nonceLength))
  return [nonce, ciphertext]
}

export const seedFromLogin = async ({ email, password }) => {
  const key = new Buffer(`${email}||${password}`)
  const salt = new Buffer('salty, salty, crypto')
  const bytes = nacl.box.secretKeyLength

  return new Promise((resolve) => {
    const cb = (err, progress, hash) => {
      if (hash !== undefined) {
        resolve(encode(hash))
      }
    }
    scrypt(Array.from(key), salt, seedFromLogin.rounds, 8, 1, bytes, cb)
  })
}
seedFromLogin.rounds = 16384

export class BoxKeyPair {
  constructor(skEncoded) {
    if(skEncoded !== undefined) {
      let sk = decode(skEncoded)
      this.kp = nacl.box.keyPair.fromSecretKey(Uint8Array.from(sk))
    }
    else {
      this.kp = nacl.box.keyPair()
    }
  }

  static async fromLogin (email, password) {
    return new BoxKeyPair(await seedFromLogin({ email, password }))
  }

  secretKeyBuffer () {
    return new Buffer(this.kp.secretKey)
  }

  publicKey() {
    return encode(new Buffer(this.kp.publicKey))
  }

  secretKey() {
    return encode(this.secretKeyBuffer())
  }

  encrypt(pkToEncoded, buffer) {
    let nonce = randomNonce()

    let data = Uint8Array.from(buffer)
    let pk = Uint8Array.from(decode(pkToEncoded))
    let ciphertext = nacl.box(data, nonce, pk, this.kp.secretKey)
    return packNonce(nonce, ciphertext)
  }

  decrypt(pkFromEncoded, data) {
    let pk = Uint8Array.from(decode(pkFromEncoded))
    let [nonce, ciphertext] = unpackNonce(data)
    let plaintext = nacl.box.open(ciphertext, nonce, pk, this.kp.secretKey)

    if (_.isNull(plaintext)) {
      throw new Error('Invalid key')
    }

    return new Buffer(plaintext)
  }
}

export class SignKeyPair {
  constructor(skEncoded) {
    if(skEncoded !== undefined) {
      let sk = decode(skEncoded)
      this._seed = Uint8Array.from(sk)
    }
    else {
      this._seed = nacl.randomBytes(nacl.sign.seedLength)
    }
    this.kp = nacl.sign.keyPair.fromSeed(this._seed)
    this.verifier = new VerifyKey(this.publicKey())
  }

  seedBuffer () {
    return new Buffer(this._seed)
  }

  publicKey () {
    return encode(new Buffer(this.kp.publicKey))
  }

  seed () {
    return encode(this.seedBuffer())
  }

  seal (buffer) {
    let data = Uint8Array.from(buffer)
    return new Buffer([...nacl.sign(data, this.kp.secretKey)])
  }

  open (sealed) {
    return this.verifier.open(sealed)
  }
}

export class VerifyKey {
  constructor(pkEncoded) {
    let pk = decode(pkEncoded)
    this.publicKey = Uint8Array.from(pk)
  }

  open (sealed) {
    let data = Uint8Array.from(sealed)
    let plaintext = nacl.sign.open(data, this.publicKey)

    if (_.isNull(plaintext)) {
      throw new Error('Invalid signature')
    }

    return new Buffer(plaintext)
  }
}

export class SecretKey {
  constructor(kEncoded) {
    if(kEncoded !== undefined) {
      this.k = Uint8Array.from(decode(kEncoded))
    }
    else {
      this.k = nacl.randomBytes(nacl.secretbox.keyLength)
    }
  }

  keyBuffer () {
    return new Buffer(this.k)
  }

  key() {
    return encode(this.keyBuffer())
  }

  encrypt(buffer) {
    let nonce = randomNonce()
    let ciphertext = nacl.secretbox(Uint8Array.from(buffer), nonce, this.k)
    return packNonce(nonce, ciphertext)
  }

  decrypt(buffer) {
    let [nonce, ciphertext] = unpackNonce(buffer)
    let plaintext = nacl.secretbox.open(ciphertext, nonce, this.k)
    if (_.isNull(plaintext)) {
      throw new Error('Invalid key')
    }
    return new Buffer(plaintext)
  }
}
