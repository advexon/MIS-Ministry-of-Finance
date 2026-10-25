import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { getManualContent, searchManualTopics } from '@/lib/user-manual-content'

const english = getManualContent('en')
for (const locale of ['en', 'ru', 'tj'] as const) {
  const { ui, topics } = getManualContent(locale)
  assert.equal(topics.length, 14)
  assert.equal(new Set(topics.map(topic => topic.id)).size, topics.length)
  assert.deepEqual(topics.map(topic => topic.id), english.topics.map(topic => topic.id))
  assert.ok(Object.values(ui).every(value => value.trim().length > 0))
  for (const topic of topics) {
    assert.ok(topic.title && topic.summary && topic.audience && topic.result && topic.caution)
    assert.ok(topic.steps.length >= 3)
    assert.ok(topic.steps.every(step => step.title.trim() && step.text.trim()))
    if (locale !== 'en') {
      const original = english.topics.find(item => item.id === topic.id)!
      assert.notEqual(topic.title, original.title)
      topic.steps.forEach((step, index) => assert.notEqual(step.text, original.steps[index].text))
    }
    if (topic.link) assert.ok(existsSync(new URL(`../app${topic.link.href}/page.tsx`, import.meta.url)))
    assert.ok(searchManualTopics(topics, topic.title).some(match => match.id === topic.id))
  }
  assert.equal(searchManualTopics(topics, '   ').length, topics.length)
  assert.equal(searchManualTopics(topics, 'unmatched-fixture-xyz').length, 0)
}

assert.ok(searchManualTopics(english.topics, '10 MB').some(topic => topic.id === 'bank-submission'))
assert.ok(searchManualTopics(english.topics, '  RETRY   IDENTICAL SAVE ').some(topic => topic.id === 'drafts'))
assert.ok(searchManualTopics(english.topics, 'outstanding principal').some(topic => topic.id === 'glossary'))
assert.ok(searchManualTopics(getManualContent('ru').topics, '  ИНН  ').length > 0)
assert.ok(searchManualTopics(getManualContent('tj').topics, 'РМА').length > 0)
assert.ok(english.topics.find(topic => topic.id === 'bank-submission')!.steps.some(step => step.text.includes('Approve and submit to MIS')))
assert.ok(english.topics.find(topic => topic.id === 'new-application')!.steps.some(step => step.text.includes('Branch is optional')))
console.log('User manual: 14 topics, three complete languages, valid module links and full-text search checks passed.')
