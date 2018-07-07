import assert from 'assert'
import { expect } from 'chai'
import _ from 'lodash'
import * as most from 'most'
import sqlite3 from 'sqlite3'
import uuid from 'uuid'

import StreamCache from '../lib/StreamCache'

describe('StreamCache', () => {
  const adaptor = () => new sqlite3.Database(':memory:')
  const streamId = uuid.v4()
  const key = 'testing'

  const memCache = () => new StreamCache(adaptor())
  const memStream = () => memCache().stream(streamId, key)

  const strings = (blobs) => blobs.map((b) => b.toString())
  const blobs = (strings) => strings.map((s) => new Buffer(s))

  const collect = (s) =>
    s.map((b) => [b.toString()]).reduce(Array.concat, [])

  const values = async (stream, pending) => {
    return stream.head(pending, await stream.size(pending)).then(strings)
  }

  const expectValues = async (stream, pending, expected) => {
    expect(await collect(stream.forward(pending))).to.deep.equal(expected)
    expected.reverse()
    expect(await collect(stream.reverse(pending))).to.deep.equal(expected)
  }

  describe('blob storage', async () => {
    const testStorage = (pending) => async () => {
      const stream = await memStream()
      await stream.pushAll(pending, blobs(['A', 'B', 'C']))
      expect(await stream.size(pending)).to.equal(3)
      expect(strings(await stream.head(pending, 2))).to.deep.equal(['A', 'B'])
      expect(await values(stream, pending))
        .to.deep.equal(['A', 'B', 'C'])
      expect(strings(await stream.head(pending, 10)))
        .to.deep.equal(['A', 'B', 'C'])
    }

    const testIteration = (pending) => async () => {
      const expected = _.range(4).flatMap(() => ['A', 'B', 'C', 'D', 'E'])
      const stream = await memStream()
      await stream.pushAll(pending, blobs(expected))
      await expectValues(stream, pending, expected)
    }

    it('persists in "saved" queue', testStorage(false))
    it('persists in "pending" queue', testStorage(true))
    it('can iterate over a "saved" queue', testIteration(false))
    it('can iterate over a "pending" queue', testIteration(true))
  })

  it('tracks which blocks have been synced', async () => {
    const stream = await memStream()
    await stream.pushAll(false, blobs(['A', 'B', 'C']))
    await stream.pushAll(true, blobs(['1', '2', '3']))

    expect(await stream.size(false)).to.equal(3)
    expect(await stream.size(true)).to.equal(3)

    await expectValues(stream, false, ['A', 'B', 'C'])
    await expectValues(stream, true, ['1', '2', '3'])
  })

  it('can shift blocks from pending to persisted', async () => {
    const stream = await memStream()
    await stream.pushAll(false, blobs(['A', 'B', 'C']))
    await stream.pushAll(true, blobs(['1', '2', '3']))
    await stream.shift(2)

    await expectValues(stream, false, ['A', 'B', 'C', '1', '2'])
    await expectValues(stream, true, ['3'])
    expect(await stream.size(true)).to.equal(1)

    await stream.shift(2)
      .then(() => assert(false, 'error not thrown'))
      .catch((err) => expect(err.message).to.equal('Cannot shift beyond size'))

    await stream.shift(1)

    await expectValues(stream, false, ['A', 'B', 'C', '1', '2', '3'])
    await expectValues(stream, true, [])
    return stream.shift(1)
      .then(() => assert(false, 'error not thrown'))
      .catch((err) => expect(err.message).to.equal('Cannot shift beyond size'))
  })

  it('can insert blocks after the sync point', async () => {
    const stream = await memStream()
    await stream.pushAll(false, blobs(['A', 'B', 'C']))
    await stream.pushAll(true, blobs(['1', '2', '3']))

    await stream.push(false, new Buffer('D'))
    await expectValues(stream, false, ['A', 'B', 'C', 'D'])
    await expectValues(stream, true, ['1', '2', '3'])
    await stream.shift(3)
    await expectValues(stream, false, ['A', 'B', 'C', 'D', '1', '2', '3'])
    await expectValues(stream, true, [])
  })
})
