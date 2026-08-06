// A memo is a scratch buffer, not a document store. The cap only exists so a
// runaway paste cannot turn every keystroke into a multi-megabyte row write.
//
// It lives here because both sides have to agree on it: the renderer refuses an
// edit that would cross it, and main refuses the write. If only main enforced
// it, the buffer would sail past the cap and every write after that would fail
// silently — the memo would keep accepting text it could no longer save.
export const MAX_MEMO_BODY_CHARS = 1_000_000;
