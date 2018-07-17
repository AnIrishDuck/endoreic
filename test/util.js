import { expect } from 'chai'

export const expectRejection = async (p, message) => {
  try {
    await p
    expect(false).to.equal(true)
  } catch(e) {
    expect(e.message).to.equal(message)
  }
}
