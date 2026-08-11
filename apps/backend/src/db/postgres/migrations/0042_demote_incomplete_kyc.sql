-- Demote agent accounts marked verified without PAN + Aadhaar on file.
-- Aligns legacy users with signup KYC rules (Complete KYC / under review).
UPDATE users
SET kyc_status = 'pending'
WHERE kyc_status = 'verified'
  AND role <> 'admin'
  AND (
    pan_number_encrypted IS NULL
    OR aadhaar_number_encrypted IS NULL
    OR btrim(pan_number_encrypted) = ''
    OR btrim(aadhaar_number_encrypted) = ''
  );
