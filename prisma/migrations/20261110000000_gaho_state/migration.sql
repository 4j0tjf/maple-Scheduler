-- CreateTable
CREATE TABLE "gaho_states" (
    "account_id" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gaho_states_pkey" PRIMARY KEY ("account_id")
);

-- AddForeignKey
ALTER TABLE "gaho_states" ADD CONSTRAINT "gaho_states_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
