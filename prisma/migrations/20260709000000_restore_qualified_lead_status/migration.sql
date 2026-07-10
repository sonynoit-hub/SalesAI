-- Keep qualified as a valid lead pipeline state without restoring qualification scoring tables.
ALTER TYPE "lead_status" ADD VALUE IF NOT EXISTS 'qualified';
