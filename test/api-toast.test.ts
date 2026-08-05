import { describe, it, expect, beforeEach } from 'vitest'
import { useToast, withToast, withToastOk } from '../src/lib/api'

beforeEach(() => useToast.getState().clear())

describe('withToast', () => {
  it('signals failure with undefined — so a void call is indistinguishable from an error', async () => {
    // 이 모호함이 "저장(해결됨 표시)이 아무 반응 없음" 버그의 원인이었다.
    // 반환값 없는 IPC는 withToast가 아니라 withToastOk를 써야 한다.
    const okVoid = await withToast(async () => {})
    const failed = await withToast(async () => {
      throw new Error('boom')
    })
    expect(okVoid).toBe(failed)
  })
})

describe('withToastOk', () => {
  it('returns true and shows no toast when a void call succeeds', async () => {
    expect(await withToastOk(async () => {})).toBe(true)
    expect(useToast.getState().message).toBeNull()
  })

  it('returns false and toasts the error when the call throws', async () => {
    expect(
      await withToastOk(async () => {
        throw new Error('boom')
      }),
    ).toBe(false)
    expect(useToast.getState().message).toBe('boom')
    expect(useToast.getState().kind).toBe('error')
  })
})
