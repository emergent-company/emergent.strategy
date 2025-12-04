-- Migration: Add allow_parallel_extraction to projects table
-- Description: Adds a boolean column to control whether a project allows multiple extraction jobs to run simultaneously
-- By default, jobs are queued and run one at a time per project

-- Add the column with default value of false (jobs queue by default)
ALTER TABLE kb.projects
ADD COLUMN IF NOT EXISTS allow_parallel_extraction BOOLEAN NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN kb.projects.allow_parallel_extraction IS 'When true, multiple extraction jobs can run simultaneously for this project. When false (default), jobs are queued and run one at a time.';
