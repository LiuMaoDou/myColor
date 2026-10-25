DROP POLICY IF EXISTS category_public ON categories;
DROP POLICY IF EXISTS tag_public ON tags;
CREATE OR REPLACE FUNCTION atlas_public_category(cid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM resource_categories rc JOIN resources r ON r.id=rc.resource_id WHERE rc.category_id=cid AND r.status='published' AND r.visibility='public' AND r.deleted_at IS NULL) $$;
CREATE POLICY category_public ON categories FOR SELECT USING(atlas_public_category(id));
CREATE OR REPLACE FUNCTION atlas_public_tag(tid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM resource_tags rt JOIN resources r ON r.id=rt.resource_id WHERE rt.tag_id=tid AND r.status='published' AND r.visibility='public' AND r.deleted_at IS NULL) $$;
CREATE POLICY tag_public ON tags FOR SELECT USING(atlas_public_tag(id));
INSERT INTO schema_migrations(version) VALUES('002') ON CONFLICT DO NOTHING;
