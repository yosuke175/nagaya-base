# workers/

独立させる必要のある Cloudflare Workers（バッチ処理、BYOKキーの暗号化など）を置く場所。
Phase 1 scaffold の時点では空。

**注意**: `service_role` キーなど秘密情報を扱ってよいのはこの層のみ
（platform/ のクライアントコードには絶対に置かない — CLAUDE.md DO NOT 1）。
