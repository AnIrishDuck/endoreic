import { expect } from 'chai'
import _ from 'lodash'
import uuid from 'uuid'

import * as types from '../lib/types'

const collection = {
  x: {
    reference: (id) => {
      expect('abc').to.include(id)

      return {
        id,
        fetch: () => Promise.resolve({ id })
      }
    }
  }
}
const Complex = types.Record({
  birthday: types.Date,
  simple: types.String,
  tf: types.Boolean,
  uuid: types.UUID,
  en: types.Enumeration(['abc', 'def']),
  ref: types.Reference((store) => store.x),
  rec: types.Record({ n: types.Number }),
  op: types.Option(types.Record({ n: types.Number })),
  op2: types.Option(types.Record({ n: types.Number })),
  l:
    types.List(
      types.List(
        types.Record({
          nested: types.Boolean,
          ref: types.Reference((store) => store.x),
        })
      )
    )
})

const example = {
  birthday: '1989-05-01T00:00:00-04:00',
  simple: 'always money in the banana stand',
  tf: false,
  uuid: uuid.v4(),
  en: 'def',
  ref: 'c',
  rec: { n: 12 },
  op: { n: 20 },
  op2: null,
  l: [ [ { nested: true, ref: 'a' }, { nested: false, ref: 'b' } ] ]
}

describe('a complex type', () => {
  it('can be serialized to sql', () => {
    expect(Complex.toSql(example)).to.deep.equal({
      birthday: '1989-05-01T00:00:00-04:00',
      simple: 'always money in the banana stand',
      tf: 'false',
      uuid: example.uuid,
      en: 'def',
      ref: 'c',
      rec: '{"n":12}',
      op: '+{"n":20}',
      op2: "-",
      l: '[[{"nested":true,"ref":"a"},{"nested":false,"ref":"b"}]]'
    })
  })

  it('validates', async () => {
    expect(await Complex.validate(example, collection)).to.equal(undefined)
  })

  it('survives a full round trip', async () => {
    const { fromJson, toJson, toSql, fromSql } = Complex
    const original = fromJson(example, collection)

    const around = async (it) => {
      const json = _.flow(toJson, toSql, fromSql, JSON.stringify, JSON.parse)(it)
      expect(await Complex.validate(json, collection)).to.deep.equal(undefined)
      return fromJson(json, collection)
    }

    const first = await around(original)
    expect(toJson(first)).to.deep.equal(example)
    const second = await around(first)
    expect(toJson(second)).to.deep.equal(example)
    expect(toJson(await around(second))).to.deep.equal(example)
  })
})
