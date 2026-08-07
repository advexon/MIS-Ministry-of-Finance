/** Registers the "@/" path-alias resolve hook for plain `node` runs. */
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./alias-loader.mjs', pathToFileURL('./scripts/'))
