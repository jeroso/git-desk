// cleanDiff lives in electron/git so both the renderer (src) and the
// node-flavored test project can import it. Re-exported here for renderer use.
export { cleanDiff } from '../../electron/git/diffFormat'
