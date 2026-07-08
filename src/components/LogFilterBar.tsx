import { useEffect, useState } from 'react'
import type { FilterDraft } from '../store/logStore'

interface Props {
  filter: FilterDraft
  authors: string[]
  onChange: (patch: Partial<FilterDraft>) => void
  onClear: () => void
}

const inputCls =
  'px-2 py-1 border rounded min-w-0 dark:bg-neutral-800 dark:border-neutral-600 dark:text-neutral-200'

/**
 * 디바운스 텍스트 입력: 타이핑은 즉시 화면에 반영하되, git 재조회(onCommit)는 300ms
 * 지연시켜 매 키 입력마다 로그를 다시 부르지 않게 한다. 외부 값 변경(초기화 등)은 동기화.
 */
function DebouncedInput({
  value,
  onCommit,
  placeholder,
  list,
  className,
}: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  list?: string
  className?: string
}) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  useEffect(() => {
    if (v === value) return
    const t = setTimeout(() => onCommit(v), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v])
  return (
    <input
      list={list}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      className={className}
    />
  )
}

/** 커밋 로그 필터 바: 작성자(자동완성) · 메시지 포함 · 날짜 범위. IntelliJ 스타일. */
export function LogFilterBar({ filter, authors, onChange, onClear }: Props) {
  const active = !!(filter.author || filter.text || filter.since || filter.until)
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 border-b dark:border-neutral-700 text-xs shrink-0">
      <datalist id="log-authors">
        {authors.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
      <DebouncedInput
        value={filter.author}
        onCommit={(v) => onChange({ author: v })}
        placeholder="👤 작성자"
        list="log-authors"
        className={`${inputCls} w-36`}
      />
      <DebouncedInput
        value={filter.text}
        onCommit={(v) => onChange({ text: v })}
        placeholder="🔍 메시지 포함"
        className={`${inputCls} flex-1`}
      />
      <span className="text-gray-400 dark:text-neutral-500">기간</span>
      <input
        type="date"
        value={filter.since}
        onChange={(e) => onChange({ since: e.target.value })}
        className={inputCls}
        title="시작일"
      />
      <span className="text-gray-400 dark:text-neutral-500">~</span>
      <input
        type="date"
        value={filter.until}
        onChange={(e) => onChange({ until: e.target.value })}
        className={inputCls}
        title="종료일"
      />
      {active && (
        <button
          onClick={onClear}
          className="border dark:border-neutral-600 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-neutral-800 dark:text-neutral-200 whitespace-nowrap"
          title="필터 초기화"
        >
          ✕ 초기화
        </button>
      )}
    </div>
  )
}
