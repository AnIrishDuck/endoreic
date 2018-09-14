import { expect } from 'chai'
import _ from 'lodash'

import { memoryStore } from './fixtures'
import Keymaster from './fixtures/Keymaster'

describe('Model', () => {
  it('has a debugging .toJson method', async () => {
    const keymaster = await memoryStore(Keymaster)()
    const [ parent ] = await keymaster.groups.create([
      { name: 'All Passwords' }
    ])
    const rawPassword = {
      parent,
      description: { some: 'json' },
      name: 'Example',
      password: 'toomanysecrets',
    }
    const [ password ] = await keymaster.passwords.create([rawPassword])

    const model = await password.fetch()
    expect(_.omit(model.toJson(), ['id'])).to.deep.equal({
      description: {
        "some": "json"
      },
      "name": "Example",
      "parent": parent.id,
      "password": "toomanysecrets"
    })
  })
})
