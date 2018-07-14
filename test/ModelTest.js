import { expect } from 'chai'
import Model from '../lib/Model'
import { isIn } from '../lib/validate'

import { expectRejection } from './util'

class Example extends Model {
  static kind = 'examples'
  static create = Model.create(Example)
  static validate = Model.validate(Example, {
    key: isIn(['a', 'b'])
  })
}

describe('Model', () => {
  it('validates on creation', async () => {
    const valid = await Example.create(null, { key: 'b' })
    expect(valid.key).to.equal('b')
    await expectRejection(
      Example.create(null, { key: 'c' }),
      `Invalid examples entry: {"key":"invalid key: 'c'"}`
    )
  })
})
