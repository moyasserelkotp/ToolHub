-- Migration: Add requires_approval to tools table
ALTER TABLE tools ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT false;
