// セーブ: スロットは 3 つ（別々の冒険）。スロットごとに { save: ふだんのセーブ, clear: クリアしたときの仲間, nmBest: ナイトメアで耐えた秒 }。
// ふだんのセーブは、ポーズの SAVE を押したときだけ書く（戦いの最中は押せない）。
// 中断用のセーブ（suspend）は、ブラウザを閉じた・隠したときだけ自動で書き、次に開いたら一度だけそこから再開できる（読んだら消す。戻ってきて遊び続けたら消す）
export const SLOTS = 3
// 試し（?test）は別の名前で持つ（gunzo-test-slot-1 など）。ふだんのセーブと混ざらない
let pre = 'gunzo-'
export const useTestSaves = () => { pre = 'gunzo-test-' }
const slotKey = (n) => `${pre}slot-${n}`
const suspendKey = (n) => `${pre}suspend-${n}`
const get = (k) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null } catch { return null } }
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true } catch { return false } }   // 容量がなければ諦める
const del = (k) => { try { localStorage.removeItem(k) } catch { /* ignore */ } }

// 前の形（1 つだけの自動セーブ）が残っていれば、スロット 1 に移す
export function migrate() {
  const old = get('gunzo-save-v1')
  if (!old) return
  if (!get(slotKey(1))) put(slotKey(1), { save: old })
  del('gunzo-save-v1')
}
export const readSlot = (n) => get(slotKey(n))
export const writeSlot = (n, d) => put(slotKey(n), d)
export const deleteSlot = (n) => { del(slotKey(n)); del(suspendKey(n)) }
export const readSuspend = (n) => get(suspendKey(n))
export const writeSuspend = (n, d) => put(suspendKey(n), d)
export const clearSuspend = (n) => del(suspendKey(n))

// いちばんよい記録（スロットに関係なく 1 つずつ）: クリア時間（短いほどよい）と、ナイトメアで耐えた秒（長いほどよい）
export const readNum = (k) => Number(localStorage.getItem(pre + k)) || 0
export const writeNum = (k, v) => { try { localStorage.setItem(pre + k, String(v)) } catch { /* ignore */ } }
export const BEST_KEY = 'best'                       // gunzo-best
export const NM_BEST_KEY = 'nm-best'                 // gunzo-nm-best
