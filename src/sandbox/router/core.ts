import type {
  MicroLocation,
  MicroState,
  LocationQuery,
  HandleMicroPathResult,
} from '@micro-app/types'
import globalEnv from '../../libs/global_env'
import {
  assign,
  parseQuery,
  stringifyQuery,
  isString,
  isUndefined,
  isPlainObject,
  createURL,
} from '../../libs/utils'
import { appInstanceMap } from '../../create_app'

// set micro app state to origin state
export function setMicroState (
  appName: string,
  microState: MicroState,
): MicroState {
  const rawState = globalEnv.rawWindow.history.state
  const additionalState: Record<string, any> = {
    microAppState: assign({}, rawState?.microAppState, {
      [appName]: microState
    })
  }

  // create new state object
  return assign({}, rawState, additionalState)
}

// delete micro app state form origin state
export function removeMicroState (appName: string, rawState: MicroState): MicroState {
  if (isPlainObject(rawState?.microAppState)) {
    if (!isUndefined(rawState.microAppState[appName])) {
      delete rawState.microAppState[appName]
    }
    if (!Object.keys(rawState.microAppState).length) {
      delete rawState.microAppState
    }
  }

  return assign({}, rawState)
}

// get micro app state form origin state
export function getMicroState (appName: string): MicroState {
  return globalEnv.rawWindow.history.state?.microAppState?.[appName] || null
}

const ENC_AD_RE = /&/g // %M1
const ENC_EQ_RE = /=/g // %M2
const DEC_AD_RE = /%M1/g // &
const DEC_EQ_RE = /%M2/g // =

// encode path with special symbol
export function encodeMicroPath (path: string): string {
  return encodeURIComponent(commonDecode(path).replace(ENC_AD_RE, '%M1').replace(ENC_EQ_RE, '%M2'))
}

// decode path
export function decodeMicroPath (path: string): string {
  return commonDecode(path).replace(DEC_AD_RE, '&').replace(DEC_EQ_RE, '=')
}

// Recursively resolve address
function commonDecode (path: string): string {
  try {
    const decPath = decodeURIComponent(path)
    if (path === decPath || DEC_AD_RE.test(decPath) || DEC_EQ_RE.test(decPath)) return decPath
    return commonDecode(decPath)
  } catch {
    return path
  }
}

// Format the query parameter key to prevent conflicts with the original parameters
function formatQueryAppName (appName: string) {
  // return `app-${appName}`
  return appName
}

/**
 * Get app fullPath from browser url
 * @param appName app.name
 */
export function getMicroPathFromURL (appName: string): string | null {
  const rawLocation = globalEnv.rawWindow.location
  const queryObject = getQueryObjectFromURL(rawLocation.search, rawLocation.hash)
  const microPath = queryObject.hashQuery?.[formatQueryAppName(appName)] || queryObject.searchQuery?.[formatQueryAppName(appName)]
  return isString(microPath) ? decodeMicroPath(microPath) : null
}

/**
 * Attach child app fullPath to browser url
 * @param appName app.name
 * @param microLocation location of child app
 */
export function setMicroPathToURL (appName: string, microLocation: MicroLocation): HandleMicroPathResult {
  let { pathname, search, hash } = globalEnv.rawWindow.location
  const queryObject = getQueryObjectFromURL(search, hash)
  const encodedMicroPath = encodeMicroPath(
    microLocation.pathname +
    microLocation.search +
    microLocation.hash
  )

  /**
   * Is parent is hash router
   * In fact, this is not true. It just means that the parameter is added to the hash
   */
  let isAttach2Hash = false
  // If hash exists and search does not exist, it is considered as a hash route
  if (hash && !search) {
    isAttach2Hash = true
    if (queryObject.hashQuery) {
      queryObject.hashQuery[formatQueryAppName(appName)] = encodedMicroPath
    } else {
      queryObject.hashQuery = {
        [formatQueryAppName(appName)]: encodedMicroPath
      }
    }
    const baseHash = hash.includes('?') ? hash.slice(0, hash.indexOf('?') + 1) : hash + '?'
    hash = baseHash + stringifyQuery(queryObject.hashQuery)
  } else {
    if (queryObject.searchQuery) {
      queryObject.searchQuery[formatQueryAppName(appName)] = encodedMicroPath
    } else {
      queryObject.searchQuery = {
        [formatQueryAppName(appName)]: encodedMicroPath
      }
    }
    search = '?' + stringifyQuery(queryObject.searchQuery)
  }

  return {
    fullPath: pathname + search + hash,
    isAttach2Hash,
  }
}

/**
 * Delete child app fullPath from browser url
 * @param appName app.name
 * @param targetLocation target Location, default is rawLocation
 */
export function removeMicroPathFromURL (appName: string, targetLocation?: MicroLocation): HandleMicroPathResult {
  let { pathname, search, hash } = targetLocation || globalEnv.rawWindow.location
  const queryObject = getQueryObjectFromURL(search, hash)

  let isAttach2Hash = false
  if (queryObject.hashQuery?.[formatQueryAppName(appName)]) {
    isAttach2Hash = true
    delete queryObject.hashQuery?.[formatQueryAppName(appName)]
    const hashQueryStr = stringifyQuery(queryObject.hashQuery)
    hash = hash.slice(0, hash.indexOf('?') + Number(Boolean(hashQueryStr))) + hashQueryStr
  } else if (queryObject.searchQuery?.[formatQueryAppName(appName)]) {
    delete queryObject.searchQuery?.[formatQueryAppName(appName)]
    const searchQueryStr = stringifyQuery(queryObject.searchQuery)
    search = searchQueryStr ? '?' + searchQueryStr : ''
  }

  return {
    fullPath: pathname + search + hash,
    isAttach2Hash,
  }
}

/**
 * Format search, hash to object
 */
function getQueryObjectFromURL (search: string, hash: string): LocationQuery {
  const queryObject: LocationQuery = {}

  if (search !== '' && search !== '?') {
    queryObject.searchQuery = parseQuery(search.slice(1))
  }

  if (hash.includes('?')) {
    queryObject.hashQuery = parseQuery(hash.slice(hash.indexOf('?') + 1))
  }

  return queryObject
}

/**
 * get microApp path from browser URL without hash
 */
export function getNoHashMicroPathFromURL (appName: string, baseUrl: string): string {
  const microPath = getMicroPathFromURL(appName)
  if (!microPath) return ''
  const formatLocation = createURL(microPath, baseUrl)
  return formatLocation.origin + formatLocation.pathname + formatLocation.search
}

/**
 * Effect app is an app that can perform route navigation
 * NOTE: Invalid app action
 * 1. prevent update browser url, dispatch popStateEvent, reload browser
 * 2. It can update path with pushState/replaceState
 * 3. Can not update path outside (with router api)
 * 3. Can not update path by location
 */
export function isEffectiveApp (appName: string): boolean {
  const app = appInstanceMap.get(appName)
  return !!(app && !app.isPrefetch)
}
