-- 修正: 部屋番号シーケンス room_no_seq への USAGE 権限付与漏れ。
--
-- room_no_seq は 20260704040000 で作成したが、service_role / authenticated への
-- シーケンス付与は初期の role_grants（それ以前のマイグレーション）で
-- 「その時点に存在する全シーケンス」に対してだけ行われていたため、
-- あとから作った room_no_seq には効いていなかった。
--
-- その結果、role 変更などで assign_room_no トリガーの nextval('room_no_seq') が
-- 走ると「permission denied for sequence room_no_seq」で UPDATE が失敗していた
-- （大家の間での guest→user 昇格が update failed になる原因）。

grant usage, select on sequence room_no_seq to authenticated, service_role;
