import { expect } from 'chai'
import { expectRejection } from './util'
import Example from './fixtures/Example'

describe.skip('Model', () => {
  it('validates on creation', async () => {
    const valid = await Example.create(null, { key: 'b' })
    expect(valid.key).to.equal('b')
    await expectRejection(
      Example.create(null, { key: 'c' }),
      `Invalid examples entry: {"key":"invalid key: 'c'"}`
    )
  })
})
