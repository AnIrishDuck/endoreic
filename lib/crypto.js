import base64url from 'base64-url'
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

    static fromLogin (email, password) {
        const key = new Buffer(`${email}||${password}`)
        const salt = new Buffer('salty, salty, crypto')
        const bytes = nacl.box.secretKeyLength

        return new Promise((resolve) => {
            const cb = (err, progress, hash) => {
                if (hash !== undefined) {
                    resolve(new BoxKeyPair(encode(hash)))
                }
            }
            scrypt(key, salt, BoxKeyPair.rounds, 8, 1, bytes, cb)
        })
    }

    publicKey() {
        return encode(new Buffer(this.kp.publicKey))
    }

    secretKey() {
        return encode(new Buffer(this.kp.secretKey))
    }

    encrypt(pkToEncoded, buffer) {
        let nonce = randomNonce()

        let data = Uint8Array.from(buffer)
        let pk = decode(pkToEncoded)
        let ciphertext = nacl.box(data, nonce, pk, this.kp.secretKey)
        return packNonce(nonce, ciphertext)
    }

    decrypt(pkFromEncoded, data) {
        let pk = Uint8Array.from(decode(pkFromEncoded))
        let [nonce, ciphertext] = unpackNonce(data)
        let plaintext = nacl.box.open(ciphertext, nonce, pk, this.kp.secretKey)

        if (plaintext === false) {
            throw new Error('Invalid key')
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
        if (plaintext === false) {
            throw new Error('Invalid key')
        }
        return new Buffer(plaintext)
    }
}
BoxKeyPair.rounds = 16384

const serverPublicKey = 'vMRQLuYxtxQwOF1w9Lbm1-iBQN_X7Y8gkDRVlEAHYhk'
export const authToken = (key) => {
    const time = (new Date()).getTime().toString()
    return encode(key.encrypt(serverPublicKey, new Buffer(time)))
}
