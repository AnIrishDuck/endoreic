import { expect } from 'chai'
import _ from 'lodash'

import { keyring, Server } from '../lib/fakes'
import { db } from './fixtures'
import Blob from '../lib/Blob'

describe('Blob', () => {
  const ring = keyring()
  const corpus = Array.from('abcdefg').map((v) => v.charCodeAt(0))
  const blobby = Buffer.from(
    _.flatten(_.times(13 * 1024, _.constant(corpus)))
  )

  const largeCompare = (a, b) => {
    const chunk = (v) => _.chunk([...v.toString()], 128)
    // so we don't have massive error dumps:
    expect(a.length).to.equal(b.length)
    _.zip(chunk(a), chunk(b)).forEach(
      ([a, b]) => expect(a.toString()).to.equal(b.toString())
    )
    expect(a.toString()).to.equal(b.toString()) // sanity
  }

  it('can be read and written to locally', async () => {
    const blob = await Blob.create(db(), null, ring, blobby)
    const back = await blob.read()
    largeCompare(blobby, back)
  })

  it('can be written, synced and read somewhere else', async () => {
    const server = new Server()
    const remote = await Blob.create(db(), server, ring, blobby)
    const local = await Blob.from(db(), server, ring)

    const start = await remote.progress()
    expect(start.up).to.equal(true)
    expect(start.saved).to.equal(0)

    await remote.sync()
    const done = await remote.progress()
    expect(done.up).to.equal(true)
    expect(done.saved).to.equal(done.total)

    local.batchSizes = { pull: 1 }
    expect(await local.progress()).to.deep.equal({
      down: true,
      saved: 1,
      total: start.total
    })

    local.batchSizes = { pull: 10 }
    await local.sync()

    const back = await local.read()
    largeCompare(blobby, back)
  })
})
