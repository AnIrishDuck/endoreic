import { expect } from 'chai'
import { nonBlank } from '../lib/validate'

describe('nonBlank', () => {
  it('only accepts non-blank strings', () => {
    expect(nonBlank('Key', null)).to.equal("invalid Key: 'null'")
    expect(nonBlank('Key', '')).to.equal('Key cannot be blank')
    expect(nonBlank('Key', 'abc')).to.equal(undefined)
  })
})
