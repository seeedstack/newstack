"""Regenerate infra/migrations/0001_initial_schema.sql from the one SQL fence in
ARCHITECTURE.md §4 that defines the schema (same technique as validation/db/extract.py's
schema extraction, but keeping CREATE EXTENSION and VECTOR(384) as-is — this runs against
a real pgvector-enabled Postgres, not the test suite's REAL[] substitute).

usage: python infra/generate_migration_0001.py ../docs/ARCHITECTURE.md
"""
import re
import sys

doc = open(sys.argv[1], encoding="utf-8").read()
blocks = re.findall(r"```sql\n(.*?)```", doc, re.S)
hits = [b for b in blocks if "CREATE TABLE sources (" in b]
if len(hits) != 1:
    sys.exit(f"generate_migration_0001: expected exactly 1 schema block, found {len(hits)}")
out_path = "infra/migrations/0001_initial_schema.sql"
with open(out_path, "w", encoding="utf-8") as f:
    f.write("-- GENERATED from docs/ARCHITECTURE.md §4 by infra/generate_migration_0001.py. Do not hand-edit.\n")
    f.write(hits[0])
print(f"wrote {out_path}")
