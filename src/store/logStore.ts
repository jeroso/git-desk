import { create } from 'zustand'
import type { Branch, Commit, GraphLayout, LogResult, LogFilter } from '../types'
import { withToast } from '../lib/api'

/** 컨트롤드 입력용 필터 초안(빈 문자열=미적용). git 호출 시 LogFilter로 변환한다. */
export interface FilterDraft {
  author: string
  text: string
  since: string
  until: string
}

const EMPTY_FILTER: FilterDraft = { author: '', text: '', since: '', until: '' }

/** 초안을 git에 넘길 LogFilter로 변환. 모든 필드가 비면 undefined(=필터 없음). */
function toLogFilter(f: FilterDraft): LogFilter | undefined {
  const author = f.author.trim()
  const text = f.text.trim()
  const since = f.since.trim()
  const until = f.until.trim()
  if (!author && !text && !since && !until) return undefined
  return {
    ...(author ? { author } : {}),
    ...(text ? { text } : {}),
    ...(since ? { since } : {}),
    ...(until ? { until } : {}),
  }
}

interface LogState {
  branches: Branch[]
  commits: Commit[]
  graph: GraphLayout | null
  /** null = all branches (--all); otherwise the branch/ref whose history is shown. */
  selectedRef: string | null
  /** 현재 체크아웃된 로컬 브랜치 이름. detached HEAD면 null. */
  currentBranch: string | null
  /** 커밋 로그 필터(작성자/메시지/날짜). 브랜치 선택과 AND로 함께 적용된다. */
  filter: FilterDraft
  /** 필터 작성자 자동완성용, 저장소 전체 작성자 목록. */
  authors: string[]
  selectedHash: string | null
  selectedHashes: string[]
  changedFiles: { path: string; status: string }[]
  selectedFile: string | null
  diff: string
  refresh: (repo: string) => Promise<void>
  /** Switch the log to a branch's history (null = all branches), then reload. */
  selectBranch: (repo: string, ref: string | null) => Promise<void>
  /** 필터 일부를 갱신하고 로그를 다시 불러온다. */
  setFilter: (repo: string, patch: Partial<FilterDraft>) => Promise<void>
  /** 필터를 모두 비우고 로그를 다시 불러온다. */
  clearFilter: (repo: string) => Promise<void>
  /** 저장소 작성자 목록을 불러온다(자동완성용). */
  loadAuthors: (repo: string) => Promise<void>
  selectCommit: (repo: string, hash: string) => Promise<void>
  selectCommits: (repo: string, hashes: string[]) => Promise<void>
  selectFile: (repo: string, file: string) => Promise<void>
}

export const useLogStore = create<LogState>((set, get) => ({
  branches: [],
  commits: [],
  graph: null,
  selectedRef: null,
  currentBranch: null,
  filter: EMPTY_FILTER,
  authors: [],
  selectedHash: null,
  selectedHashes: [],
  changedFiles: [],
  selectedFile: null,
  diff: '',
  refresh: async (repo) => {
    let ref = get().selectedRef ?? undefined
    const filter = toLogFilter(get().filter)
    let log = (await withToast(() =>
      window.api.git.log(repo, undefined, ref, filter),
    )) as LogResult | undefined
    // The filtered ref may have vanished (branch deleted / remote pruned). Fall
    // back to all branches instead of leaving the log permanently broken.
    if (log === undefined && ref !== undefined) {
      ref = undefined
      set({ selectedRef: null })
      log = (await withToast(() => window.api.git.log(repo, undefined, undefined, filter))) as
        | LogResult
        | undefined
    }
    const branches = (await withToast(() => window.api.git.branches(repo))) as Branch[] | undefined
    set({
      commits: log?.commits ?? [],
      graph: log?.graph ?? null,
      branches: branches ?? [],
      currentBranch: branches?.find((b) => b.isCurrent)?.name ?? null,
      selectedHash: null,
      selectedHashes: [],
      changedFiles: [],
      selectedFile: null,
      diff: '',
    })
  },
  selectBranch: async (repo, ref) => {
    set({ selectedRef: ref })
    await get().refresh(repo)
  },
  setFilter: async (repo, patch) => {
    set({ filter: { ...get().filter, ...patch } })
    await get().refresh(repo)
  },
  clearFilter: async (repo) => {
    set({ filter: EMPTY_FILTER })
    await get().refresh(repo)
  },
  loadAuthors: async (repo) => {
    const authors = (await withToast(() => window.api.git.authors(repo))) as string[] | undefined
    set({ authors: authors ?? [] })
  },
  selectCommit: async (repo, hash) => {
    const files = (await withToast(() => window.api.git.commitFiles(repo, hash))) ?? []
    set({ selectedHash: hash, selectedHashes: [hash], changedFiles: files, selectedFile: null, diff: '' })
  },
  selectCommits: async (repo, hashes) => {
    if (hashes.length === 0) {
      set({ selectedHash: null, selectedHashes: [], changedFiles: [], selectedFile: null, diff: '' })
      return
    }
    if (hashes.length === 1) {
      await get().selectCommit(repo, hashes[0])
      return
    }
    const oldest = hashes[0]
    const newest = hashes[hashes.length - 1]
    const files = (await withToast(() => window.api.git.rangeFiles(repo, oldest, newest))) ?? []
    set({ selectedHash: newest, selectedHashes: hashes, changedFiles: files, selectedFile: null, diff: '' })
  },
  selectFile: async (repo, file) => {
    const { selectedHash, selectedHashes } = get()
    if (selectedHashes.length > 1) {
      const oldest = selectedHashes[0]
      const newest = selectedHashes[selectedHashes.length - 1]
      const diff = (await withToast(() => window.api.git.rangeDiff(repo, oldest, newest, file))) ?? ''
      set({ selectedFile: file, diff })
      return
    }
    if (!selectedHash) return
    const diff = (await withToast(() => window.api.git.commitDiff(repo, selectedHash, file))) ?? ''
    set({ selectedFile: file, diff })
  },
}))
