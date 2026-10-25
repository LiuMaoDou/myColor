-- Cross-table ownership must hold even if a write bypasses the service layer.
CREATE OR REPLACE FUNCTION atlas_guard_relations() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parent_owner uuid; current_id uuid; next_id uuid; seen uuid[]; depth integer;
BEGIN
 IF TG_TABLE_NAME='resource_private_notes' THEN
  SELECT owner_id INTO parent_owner FROM resources WHERE id=NEW.resource_id;
  IF parent_owner IS DISTINCT FROM NEW.owner_id THEN RAISE EXCEPTION 'Cross-owner note forbidden'; END IF;
 ELSIF TG_TABLE_NAME='categories' THEN
  IF NEW.parent_id IS NOT NULL THEN
   SELECT owner_id INTO parent_owner FROM categories WHERE id=NEW.parent_id;
   IF parent_owner IS DISTINCT FROM NEW.owner_id THEN RAISE EXCEPTION 'Cross-owner category forbidden'; END IF;
  END IF;
  FOR current_id IN SELECT id FROM categories WHERE owner_id=NEW.owner_id LOOP
   next_id=current_id; seen='{}'; depth=0;
   WHILE next_id IS NOT NULL LOOP
    IF next_id=ANY(seen) THEN RAISE EXCEPTION 'Category cycle forbidden'; END IF;
    depth=depth+1; IF depth>3 THEN RAISE EXCEPTION 'Category depth exceeds three'; END IF;
    seen=array_append(seen,next_id); SELECT parent_id INTO next_id FROM categories WHERE id=next_id;
   END LOOP;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER note_owner_guard BEFORE INSERT OR UPDATE ON resource_private_notes FOR EACH ROW EXECUTE FUNCTION atlas_guard_relations();
CREATE CONSTRAINT TRIGGER category_tree_guard AFTER INSERT OR UPDATE ON categories DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION atlas_guard_relations();
INSERT INTO schema_migrations(version) VALUES('003');
