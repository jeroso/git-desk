// Strip git's noisy file-header lines from a unified diff so it reads cleanly,
// IntelliJ-style: keep the @@ hunk markers and the actual +/- /context lines,
// drop "diff --git", "index", "--- a/", "+++ b/", mode/rename metadata, etc.
const NOISE = [
  /^diff --git /,
  /^index [0-9a-f]/,
  /^--- /,
  /^\+\+\+ /,
  /^new file mode /,
  /^deleted file mode /,
  /^old mode /,
  /^new mode /,
  /^similarity index /,
  /^dissimilarity index /,
  /^rename (from|to) /,
  /^copy (from|to) /,
  /^\\ No newline at end of file/,
]

export function cleanDiff(raw: string): string {
  if (!raw) return raw
  return raw
    .split('\n')
    .filter((line) => !NOISE.some((re) => re.test(line)))
    .join('\n')
    .replace(/^\n+/, '') // trim leading blank lines left behind
}
