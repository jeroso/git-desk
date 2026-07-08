import { describe, it, expect, vi, beforeEach } from 'vitest'

// execFile을 목으로 대체해 동시성/직렬화/env를 결정적으로 단언한다. 실제 git의
// index.lock 보유는 sub-ms라 레이스 재현이 비결정적이므로, 호출 계층(exec.ts)이
// (1) 같은 저장소 명령을 순차 실행하고 (2) 다른 저장소는 병렬 유지하며
// (3) GIT_OPTIONAL_LOCKS=0을 넘기는지를 직접 검증한다.
const h = vi.hoisted(() => ({
  active: {} as Record<string, number>, // 저장소별 동시 실행 수
  max: {} as Record<string, number>, // 저장소별 최대 동시 실행 수
  global: { now: 0, max: 0 }, // 전체(저장소 무관) 동시 실행 수
  envs: [] as Array<Record<string, string | undefined> | undefined>,
  delay: 10,
}))

vi.mock('node:child_process', () => ({
  execFile: (
    _file: string,
    _args: string[],
    options: { cwd: string; env?: Record<string, string | undefined> },
    cb: (e: unknown, r: { stdout: string; stderr: string }) => void,
  ) => {
    const cwd = options.cwd
    h.envs.push(options.env)
    h.active[cwd] = (h.active[cwd] ?? 0) + 1
    h.max[cwd] = Math.max(h.max[cwd] ?? 0, h.active[cwd])
    h.global.now += 1
    h.global.max = Math.max(h.global.max, h.global.now)
    setTimeout(() => {
      h.active[cwd] -= 1
      h.global.now -= 1
      cb(null, { stdout: 'ok', stderr: '' })
    }, h.delay)
  },
}))

import { git } from '../electron/git/exec'

beforeEach(() => {
  for (const k of Object.keys(h.active)) delete h.active[k]
  for (const k of Object.keys(h.max)) delete h.max[k]
  h.global.now = 0
  h.global.max = 0
  h.envs.length = 0
})

describe('git() per-repo serialization + optional-locks', () => {
  it('serializes concurrent commands on the same repo (max concurrency 1)', async () => {
    await Promise.all(Array.from({ length: 5 }, (_, i) => git('/repoA', ['status', String(i)])))
    expect(h.max['/repoA']).toBe(1)
  })

  it('runs commands on different repos concurrently (not a single global lock)', async () => {
    await Promise.all([
      git('/r1', ['status']),
      git('/r1', ['status']),
      git('/r2', ['status']),
      git('/r2', ['status']),
    ])
    // 각 저장소는 직렬(최대 1)이지만, 서로 다른 저장소는 동시에 떠야 한다.
    expect(h.max['/r1']).toBe(1)
    expect(h.max['/r2']).toBe(1)
    expect(h.global.max).toBeGreaterThanOrEqual(2)
  })

  it('passes GIT_OPTIONAL_LOCKS=0 to every git invocation', async () => {
    await git('/repoB', ['status'])
    expect(h.envs[0]?.GIT_OPTIONAL_LOCKS).toBe('0')
  })

  it('passes LC_ALL=C to force English git messages (locale-independent detection)', async () => {
    await git('/repoC', ['status'])
    expect(h.envs[0]?.LC_ALL).toBe('C')
  })
})
