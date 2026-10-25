-- Single-user workspace: retain owner IDs and all resources; remove credentials.
DROP TABLE sessions;
ALTER TABLE users DROP COLUMN username, DROP COLUMN password_hash;
INSERT INTO schema_migrations(version) VALUES('004');
