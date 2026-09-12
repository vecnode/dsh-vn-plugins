// The vendored engine's entry: everything dsh-terminal's browser half needs,
// bundled to one classic IIFE exposing `window.DSHTerminal`.
//
// xterm.js is the terminal emulator (the ANSI/Unicode screen, scrollback and
// input handling); FitAddon measures the host element and computes the
// cols/rows the PTY is then resized to. Pinned to the 5.x line whose
// `Terminal` / `FitAddon` API is stable and whose addon declares that peer.
export { Terminal } from '@xterm/xterm'
export { FitAddon } from '@xterm/addon-fit'
