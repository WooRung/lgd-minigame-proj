-- 원문 IP와 세션은 저장하지 않는다. 만료된 제한 카운터는 정리한다.
CREATE TABLE rate_limits (
  subject TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  resets_at INTEGER NOT NULL
);
CREATE INDEX rate_limits_expiry ON rate_limits(resets_at);
