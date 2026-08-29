"""
collector.bus_vision パッケージ
---------------------------------------------------------
Bus-Vision の時刻表詳細ページ(diagramDetail.html相当)のHTML文字列を
解析するための、ネットワークに一切依存しない純粋な変換ロジック。

collector パッケージの他の部分(config.py / http_client.py /
checkpoint.py / run_collect.py = ネットワーク層・許可ゲート・
チェックポイント管理)とは完全に分離しており、このサブパッケージは
- どのネットワーク関数も import しない
- PERMISSION_GRANTED を一切参照しない
- 入力はすべて呼び出し側が渡すHTML文字列・URL文字列のみ

そのため、保存済みのHTMLファイル(フィクスチャ)を差し替えるだけで、
実ネットワークアクセスなしにいつでもテスト・開発できる。
"""
