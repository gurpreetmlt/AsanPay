-- Rename role enum value: master_distributor → super_distributor.
-- Atomic rename (Postgres 10+); no table rewrite; existing rows follow automatically.
ALTER TYPE "user_role" RENAME VALUE 'master_distributor' TO 'super_distributor';
