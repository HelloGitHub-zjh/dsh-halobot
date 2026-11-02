import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseReply, stripArtifacts } from '../src/chat/reply.js'

const texts = (input) => parseReply(input).items.filter((i) => i.kind === 'text').map((i) => i.value)

test('整段被 <p> 包住时只留下正文', () => {
  assert.deepEqual(texts('<p>我这两天在看的那个还挺上头的</p>'), ['我这两天在看的那个还挺上头的'])
})

test('单独一行 </p> 不会发出去', () => {
  assert.deepEqual(texts('快十二点了\n</p>'), ['快十二点了'])
})

test('行首多打的 text 洗掉', () => {
  assert.deepEqual(texts('text\n快十二点了。'), ['快十二点了。'])
  assert.deepEqual(texts('\ntext\n吃完饭了吧。'), ['吃完饭了吧。'])
  assert.deepEqual(texts('text，那也不算白忙'), ['那也不算白忙'])
  assert.deepEqual(texts('text吃完饭了吧'), ['吃完饭了吧'])
})

test('正文里真有 text 这个词时不动它', () => {
  assert.deepEqual(texts('text 这个词你会用吗'), ['text 这个词你会用吗'])
})

test('<br> 当换行，再按她的习惯并成一句', () => {
  assert.deepEqual(texts('第一句<br>第二句'), ['第一句，第二句'])
})

test('半截 DSML 尾巴去掉', () => {
  assert.deepEqual(texts('好的\n</｜｜DSML｜｜ invoke>'), ['好的'])
})

test('协议标签照旧', () => {
  const items = parseReply('<sticker:吃瓜>那也不算白忙').items
  assert.equal(items[0].kind, 'sticker')
  assert.equal(items[0].value, '吃瓜')
  assert.equal(items[1].value, '那也不算白忙')
  assert.equal(parseReply('<voice>念一句</voice>').items[0].kind, 'voice')
})

test('stripArtifacts 不碰尖括号里的正常文字', () => {
  assert.equal(stripArtifacts('她问我 1<2 是真的吗'), '她问我 1<2 是真的吗')
})
