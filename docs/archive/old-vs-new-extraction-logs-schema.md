# Old Database (spec-server-db-1) - object_extraction_logs table schema

```sql
                            Table "kb.object_extraction_logs"
      Column       |           Type           | Collation | Nullable |      Default      
-------------------+--------------------------+-----------+----------+-------------------
 id                | uuid                     |           | not null | gen_random_uuid()
 extraction_job_id | uuid                     |           | not null | 
 logged_at         | timestamp with time zone |           | not null | now()
 step_index        | integer                  |           | not null | 
 operation_type    | text                     |           | not null | 
 operation_name    | text                     |           |          | 
 status            | text                     |           | not null | 'success'::text
 input_data        | jsonb                    |           |          | 
 output_data       | jsonb                    |           |          | 
 error_message     | text                     |           |          | 
 error_stack       | text                     |           |          | 
 duration_ms       | integer                  |           |          | 
 tokens_used       | integer                  |           |          | 
 metadata          | jsonb                    |           |          | 
 created_at        | timestamp with time zone |           | not null | now()
Indexes:
    "object_extraction_logs_pkey" PRIMARY KEY, btree (id)
    "idx_extraction_logs_errors" btree (extraction_job_id) WHERE status = 'error'::text
    "idx_extraction_logs_job" btree (extraction_job_id)
    "idx_extraction_logs_job_id" btree (extraction_job_id)
    "idx_extraction_logs_job_step" btree (extraction_job_id, step_index)
    "idx_extraction_logs_operation" btree (extraction_job_id, operation_type)
    "idx_extraction_logs_status" btree (status)
Foreign-key constraints:
    "object_extraction_logs_extraction_job_id_fkey" FOREIGN KEY (extraction_job_id) REFERENCES kb.object_extraction_jobs(id) ON DELETE CASCADE

```

# New Database (spec-server-2-db-1) - object_extraction_logs table schema

```sql
                            Table "kb.object_extraction_logs"
       Column       |           Type           | Collation | Nullable |      Default      
--------------------+--------------------------+-----------+----------+-------------------
 id                 | uuid                     |           | not null | gen_random_uuid()
 extraction_job_id  | uuid                     |           | not null | 
 step               | character varying(50)    |           | not null | 
 status             | character varying(20)    |           | not null | 
 message            | text                     |           |          | 
 entity_count       | integer                  |           |          | 0
 relationship_count | integer                  |           |          | 0
 error_details      | jsonb                    |           |          | 
 started_at         | timestamp with time zone |           | not null | now()
 completed_at       | timestamp with time zone |           |          | 
 duration_ms        | integer                  |           |          | 
 step_index         | integer                  |           |          | 
 operation_type     | character varying(50)    |           |          | 
 operation_name     | character varying(100)   |           |          | 
 input_data         | jsonb                    |           |          | 
 output_data        | jsonb                    |           |          | 
 error_message      | text                     |           |          | 
 error_stack        | text                     |           |          | 
 tokens_used        | integer                  |           |          | 0
Indexes:
    "object_extraction_logs_pkey" PRIMARY KEY, btree (id)
    "idx_extraction_logs_job" btree (extraction_job_id)
    "idx_extraction_logs_job_step" btree (extraction_job_id, step_index)
    "idx_extraction_logs_operation" btree (operation_type) WHERE operation_type IS NOT NULL
    "idx_extraction_logs_started" btree (started_at DESC)
    "idx_extraction_logs_status" btree (status)
    "idx_extraction_logs_step" btree (step)
Check constraints:
    "chk_extraction_log_status" CHECK (status::text = ANY (ARRAY['pending'::character varying, 'running'::character varying, 'completed'::character varying, 'failed'::character varying, 'skipped'::character varying]::text[]))
Foreign-key constraints:
    "fk_object_extraction_logs_job" FOREIGN KEY (extraction_job_id) REFERENCES kb.object_extraction_jobs(id) ON DELETE CASCADE

```
