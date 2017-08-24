import assert from 'assert'
import immutable, { fromJS } from 'immutable'

/*
import { makeAction, crud } from '../lib/actions'
import { validate, assign } from '../lib/models'
import { idFrom, nonEmptyString } from '../lib/validate'
import { BoxKeyPair } from '../lib/crypto'
import { State as _State } from '../lib/state'
import { User } from '../lib/user'

export const actions = makeActionCreator({ VERSION: 1 })
const counters = crud('counters', Model)
export const actions = combineReducers({
    counters: counters.reducer
})
export counter

const id = uuid.v4()
const nextState = state.addCounter({ id , count: 1 })
const _counter = state.counter.get(id)

let _cachedLogin = null
export const login = async () => {
    const email = 'foo@bar.com'
    const password = 'too many secrets'
    if (_cachedLogin === null) {
        const normalRounds = BoxKeyPair.rounds
        BoxKeyPair.rounds = 1
        _cachedLogin = await User.login(email, password)
        BoxKeyPair.rounds = normalRounds
    }

    return _cachedLogin
}

export class State extends _State {
    getCounter (id) {
        return this._cache.get(id)
    }
}
State.Action = Action
State.start = start
*/
