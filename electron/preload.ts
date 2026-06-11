import { contextBridge, ipcRenderer } from 'electron'

const api = {
  repos: {
    list: () => ipcRenderer.invoke('repos:list'),
    remove: (p: string) => ipcRenderer.invoke('repos:remove', p),
    pickFolder: () => ipcRenderer.invoke('repos:pickFolder'),
    open: (p: string) => ipcRenderer.invoke('repos:open', p),
  },
  git: {
    log: (repo: string, limit?: number) => ipcRenderer.invoke('git:log', repo, limit),
    status: (repo: string) => ipcRenderer.invoke('git:status', repo),
    branches: (repo: string) => ipcRenderer.invoke('git:branches', repo),
    checkout: (repo: string, name: string) => ipcRenderer.invoke('git:checkout', repo, name),
    createBranch: (repo: string, name: string) =>
      ipcRenderer.invoke('git:createBranch', repo, name),
    commitFiles: (repo: string, hash: string) =>
      ipcRenderer.invoke('git:commitFiles', repo, hash),
    commitDiff: (repo: string, hash: string, file: string) =>
      ipcRenderer.invoke('git:commitDiff', repo, hash, file),
    worktreeDiff: (repo: string, file: string, staged: boolean) =>
      ipcRenderer.invoke('git:worktreeDiff', repo, file, staged),
  },
  shell: {
    openPath: (p: string) => ipcRenderer.invoke('shell:openPath', p),
  },
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
