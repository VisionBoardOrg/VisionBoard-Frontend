# VisionBoard — Database Migrations

## Structure

Migrations follow Prisma's standard directory format:

```
prisma/migrations/
  <timestamp>_<name>/
    migration.sql     ← the actual SQL applied by `prisma migrate deploy`
  README.md           ← this file
```

## How to apply

**Local development:**
```bash
npx prisma migrate dev
```

**Production / CI:**
```bash
npx prisma migrate deploy
```

## Migration history

| Directory | Description |
|-----------|-------------|
| `20240101000000_schema_drift` | Full schema drift resolution — adds all missing columns, enums, indexes, and tables to match `schema.prisma`. Idempotent. |
| `20240101000001_vector_embeddings` | pgvector ANN index — adds `embeddingVec vector(1536)` column with HNSW index for fast semantic search. Requires `CREATE EXTENSION IF NOT EXISTS vector`. |
| `2026_08_22_perf_indexes_denorm.sql` | (Legacy bare SQL) Task.workspaceId denormalisation + index tuning. See note below. |

> **Note on legacy bare `.sql` files:** The files `apply_schema_drift.sql`, `apply_vector_embeddings.sql`, and `2026_08_22_perf_indexes_denorm.sql` in this directory are the original manually-applied scripts. Their content is now canonically represented in the migration directories above. The bare files are kept for reference but should not be re-run if the migration directories have already been applied via `prisma migrate deploy`.

## Adding new migrations

```bash
npx prisma migrate dev --name describe_your_change
```

Never edit an already-applied migration file. Create a new one instead.
