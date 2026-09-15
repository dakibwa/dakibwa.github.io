-- Additive: an optional Portuguese tax number for the student's fiscal
-- documents. Existing accounts start without one; no other state changes.
-- Apply to both databases before deploying the Worker that writes it.
ALTER TABLE students ADD COLUMN nif TEXT NOT NULL DEFAULT '';
