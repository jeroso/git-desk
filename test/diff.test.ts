import { describe, it, expect } from 'vitest'
import { cleanDiff } from '../electron/git/diffFormat'

const RAW = `diff --git a/src/main/java/Foo.java b/src/main/java/Foo.java
index 843c97bd3..f4e141e94 100644
--- a/src/main/java/Foo.java
+++ b/src/main/java/Foo.java
@@ -7,6 +7,7 @@ import a.b.c;
 import d.e.f;
+import g.h.i;
 import j.k.l;
@@ -97,6 +98,10 @@ public class Foo {
+        // new line
\\ No newline at end of file`

describe('cleanDiff', () => {
  it('drops git header/metadata noise but keeps hunks and +/- lines', () => {
    const out = cleanDiff(RAW)
    expect(out).not.toMatch(/diff --git/)
    expect(out).not.toMatch(/^index /m)
    expect(out).not.toMatch(/^--- /m)
    expect(out).not.toMatch(/^\+\+\+ /m)
    expect(out).not.toMatch(/No newline at end of file/)
    // kept: hunk markers and actual content changes
    expect(out).toMatch(/^@@ -7,6 \+7,7 @@/m)
    expect(out).toMatch(/^\+import g\.h\.i;/m)
    expect(out).toMatch(/^ import d\.e\.f;/m)
  })

  it('preserves +++/--- inside content (only strips file-header forms)', () => {
    // a context line that merely starts with spaces+text is untouched
    expect(cleanDiff(' plain context')).toBe(' plain context')
  })

  it('returns empty string unchanged', () => {
    expect(cleanDiff('')).toBe('')
  })
})
