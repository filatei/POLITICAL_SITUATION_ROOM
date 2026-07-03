-- Full wipe of the Ondo election so it can be re-created fresh through the new
-- onboarding funnel (standard 10 free seats). Deletes the election and every
-- dependent row in FK-safe order. National geography (State/Lga/Ward/PollingUnit)
-- is NOT touched. Wrapped in a transaction — all or nothing.
--
-- DRY RUN FIRST (see what will be hit):
--   SELECT id, name, status FROM "Election" WHERE name ILIKE '%ondo%';
--
-- Run against the DB (from the server checkout at /opt/psr):
--   docker compose exec -T psr-app npx prisma db execute \
--     --schema prisma/schema.prisma --stdin < /opt/psr/scripts/reset-ondo.sql

BEGIN;

-- instruction receipts (child of instruction)
DELETE FROM "InstructionReceipt" ir USING "Instruction" i
WHERE ir."instructionId" = i.id
  AND i."electionId" IN (SELECT id FROM "Election" WHERE name ILIKE '%ondo%');

DELETE FROM "Instruction"
WHERE "electionId" IN (SELECT id FROM "Election" WHERE name ILIKE '%ondo%');

-- media + score records (children of submission)
DELETE FROM "Media" m USING "Submission" s
WHERE m."submissionId" = s.id
  AND s."electionId" IN (SELECT id FROM "Election" WHERE name ILIKE '%ondo%');

DELETE FROM "ScoreRecord" sr USING "Submission" s
WHERE sr."submissionId" = s.id
  AND s."electionId" IN (SELECT id FROM "Election" WHERE name ILIKE '%ondo%');

DELETE FROM "Submission"
WHERE "electionId" IN (SELECT id FROM "Election" WHERE name ILIKE '%ondo%');

-- agents (the access codes)
DELETE FROM "Agent"
WHERE "electionId" IN (SELECT id FROM "Election" WHERE name ILIKE '%ondo%');

-- candidates before parties (candidate.partyId → party)
DELETE FROM "Candidate"
WHERE "electionId" IN (SELECT id FROM "Election" WHERE name ILIKE '%ondo%');

DELETE FROM "Party"
WHERE "electionId" IN (SELECT id FROM "Election" WHERE name ILIKE '%ondo%');

-- billing + tenant + payments
DELETE FROM "Subscription"
WHERE "electionId" IN (SELECT id FROM "Election" WHERE name ILIKE '%ondo%');

DELETE FROM "Tenant"
WHERE "electionId" IN (SELECT id FROM "Election" WHERE name ILIKE '%ondo%');

DELETE FROM "Payment"
WHERE "electionId" IN (SELECT id FROM "Election" WHERE name ILIKE '%ondo%');

-- finally the election itself
DELETE FROM "Election" WHERE name ILIKE '%ondo%';

COMMIT;
