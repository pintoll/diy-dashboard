// The globally-active ("Working...") todo is now the first member of the desk
// (see desk.ts). This module keeps the single-active names alive as thin
// re-exports so the IPC handlers and agent HTTP API keep compiling unchanged
// while phases 2-3 migrate consumers to the plural desk API.
export { getActiveTodo, setActiveTodo } from "./desk";
