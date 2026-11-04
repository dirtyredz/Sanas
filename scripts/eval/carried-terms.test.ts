import { expect, it } from 'vitest'
import { TOPIC_SWITCH_EXCHANGES } from '../../src/main/services/assistant/answer-context/topic-switch-fixture'
import { carriedTerms } from './carried-terms'

it('scores carryover: a bare employer is strict-only, a referenced exchange is exempt', () => {
  const aws = TOPIC_SWITCH_EXCHANGES[1]
  expect(carriedTerms('At Acme our services ran on EKS.', aws)).toEqual([])
  expect(carriedTerms('At Acme our services ran on EKS.', aws, { strict: true })).toEqual(['acme'])
  expect(carriedTerms('The subgraph used Kafka.', aws)).toEqual(['subgraph', 'kafka'])
  const test = TOPIC_SWITCH_EXCHANGES[5]
  expect(carriedTerms('Replay Kafka events.', test)).toEqual(['kafka'])
  expect(carriedTerms('Replay Kafka events.', test, { referenced: 'a Kafka consumer' })).toEqual([])
})
