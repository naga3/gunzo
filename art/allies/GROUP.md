# 味方（allies）

- 1 職 1 ファイル（`sword.pic` は剣士）。ファイル名は職の名前（sword spear shield bow xbow axe boom mage bomb volt heal）。
- 絵は正面だけ: 立ち `down`（16 × 16）。
- 歩きのコマ: `down_walk1`・`down_walk2`。動きはファイルの `anim` の行で決める:
  `anim walk_down down_walk1:120 down:120 down_walk2:120 down:120`（walk1 → 立ち → walk2 → 立ち。数字は 1 コマの長さ ms）。ゲームは歩くとき、どちらへ動いても `walk_down` を流す。
  walk1 と walk2 は左右の足を入れ替えた形にし、どちらも立ちより体全体（頭・胴・持ち物）を 1 点下げて、沈みながら歩く感じにする。地面に着いた足の裏は立ちと同じ高さにそろえる。
- アニメのコマは、動きに合うなら体の位置を立ちからずらしてよい（歩きの沈み、攻撃の踏み込みなど）。
