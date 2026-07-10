-- DropIndex
DROP INDEX "contacts_company_id_email_key";

-- CreateIndex
CREATE INDEX "contacts_company_id_email_idx" ON "contacts"("company_id", "email");
