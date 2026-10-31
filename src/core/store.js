// 数据目录、JSON 读写（UTF-8 无 BOM、先写临时文件再改名）。

import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'

export function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/** 插件所有数据都放这儿：~/.dsh/plugins-data/halobot/ */
const LEGACY_DIR = 'aurabot'
const BASE_CACHE = { dir: '' }
function baseDir() {
  const env = process.env.HALOBOT_DATA_DIR || process.env.AURABOT_DATA_DIR
  if (env) return env
  if (BASE_CACHE.dir) return BASE_CACHE.dir
  const root = join(dshHome(), 'plugins-data')
  const now = join(root, 'halobot')
  const old = join(root, LEGACY_DIR)
  try {
    // 从旧版（Aurabot）改名过来的：数据整个搬过去，配置/记忆/表情库都还在
    if (!existsSync(now) && existsSync(old)) renameSync(old, now)
  } catch (error) {}
  BASE_CACHE.dir = now
  return now
}

export function dataDir(...parts) {
  return join(baseDir(), ...parts)
}

export function ensureDir(p) {
  mkdirSync(p, { recursive: true })
  return p
}

export function readJson(file, fallback) {
  try {
    let text = readFileSync(file, 'utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    return JSON.parse(text)
  } catch (error) {
    return typeof fallback === 'function' ? fallback() : fallback
  }
}

export function writeJson(file, value) {
  ensureDir(dirname(file))
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  renameSync(tmp, file)
}

export { existsSync }
