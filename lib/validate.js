import _ from 'lodash'
import validator from 'validator'

const basic = (validate) => (key, value) => {
  if (typeof value !== 'string' || !validate(value)) {
    return `invalid ${key}: '${value}'`
  }
}

export const isDecimal = basic(validator.isDecimal)
export const isUUID = basic(validator.isUUID)
export const isISO8601 = basic(validator.isISO8601)
export const isDate = isISO8601

export const isType = (expectedType) => (key, value) => {
  if (typeof value !== expectedType) {
    return `invalid ${key}: '${value}'`
  }
}
export const isIn = (valid) => {
  const validSet = new Set(valid)
  return basic((value) => validSet.has(value))
}

export const nonBlank = (key, value) =>
  isType('string')(key, value)
  || (value.length === 0 ? `${key} cannot be blank` : undefined)

export const optional = (validate) =>
  (key, value) => value === undefined ? undefined : validate(key, value)

export const validate = (validation) => (json) => {
  let errors = {}

  for (const key of _.keys(validation).concat(_.keys(json))) {
    const validate = validation[key]
    if (validate !== undefined) {
      const value = json[key]
      const error = validate(key, value)
      if (error !== undefined) errors[key] = error
    } else {
      errors[key] = 'invalid key'
    }
  }

  return errors
}

export const arrayOf = (validator) => (key, value) => {
  if (value.map === undefined) {
    return `${key} not an array: ${value}`
  }
  return value.map((el, ix) => validator(`${ix.toString()}`, el))
}

export const object = (validation) => (key, value) => {
  const errors = validate(validation)(value)
  return _.keys(errors).length > 0 ? errors : undefined
}

export const json = (validation) => (key, value) => {
  try {
    let data = JSON.parse(value)
    return object(validation)(key, data)
  } catch (err) {
    return `${key} is not valid json`
  }
}

export const wildObject = (validation) => (key, value) => {
  return object(validation)(key, _.pick(value, _.keys(validation)))
}

export const versionedObject = (versionKey, defaultValidator, versions) => {
  return (key, json) => {
    if (typeof json !== 'object') {
      return `not an object: '${json}'`
    }

    const version = json[versionKey]
    const validator = versions[version]
    if (version === undefined || validator === undefined) {
      return defaultValidator(key, json)
    }

    return validator(key, json)
  }
}

export const transform = (transforms) => (json) => {
  const transformPairs = _.toPairs(transforms)
    .filter(([key]) => json[key] !== undefined)
    .map(([key, transform]) => {
      return [key, transform(json[key])]
    })
  const transformed = _.fromPairs(transformPairs)

  return { ...json, ...transformed }
}

export const checkErrors = (displayType) => (errors, strict) => {
  if (_.keys(errors).length > 0) {
    const exception = new TypeError(`Invalid ${displayType}: ${JSON.stringify(errors)}`)
    exception.errors = errors
    if (strict) {
      throw exception
    } else {
      console.error(exception.message)
    }
  }
}
